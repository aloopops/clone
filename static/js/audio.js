// Audio recording and playback functionality using Web Audio API

let mediaRecorder = null;
let audioChunks = [];
let recordingStream = null;
let recordingStartTime = null;
let recordingTimer = null;
let isRecording = false;

// Initialize audio recording functionality
document.addEventListener('DOMContentLoaded', () => {
    if (document.body.classList.contains('chat-page')) {
        initializeAudioRecording();
    }
});

async function initializeAudioRecording() {
    try {
        // Check if getUserMedia is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn('getUserMedia not supported');
            return;
        }
        
        console.log('Audio recording initialized');
    } catch (error) {
        console.error('Error initializing audio recording:', error);
    }
}

async function toggleAudioRecording() {
    if (isRecording) {
        stopAudioRecording();
    } else {
        startAudioRecording();
    }
}

async function startAudioRecording() {
    if (!window.currentConversation) {
        MainJS.showError('Please select a conversation first');
        return;
    }
    
    try {
        // Request microphone permission
        recordingStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            } 
        });
        
        // Create MediaRecorder
        const options = {
            mimeType: 'audio/webm;codecs=opus'
        };
        
        // Fallback to other formats if webm is not supported
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options.mimeType = 'audio/webm';
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options.mimeType = 'audio/mp4';
                if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                    options.mimeType = 'audio/wav';
                }
            }
        }
        
        mediaRecorder = new MediaRecorder(recordingStream, options);
        audioChunks = [];
        
        // Set up event handlers
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = () => {
            handleRecordingStop();
        };
        
        mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder error:', event.error);
            MainJS.showError('Recording failed: ' + event.error.message);
            resetRecordingUI();
        };
        
        // Start recording
        mediaRecorder.start(100); // Collect data every 100ms
        isRecording = true;
        recordingStartTime = Date.now();
        
        // Update UI
        updateRecordingUI(true);
        
        // Start timer
        startRecordingTimer();
        
        console.log('Audio recording started');
        
    } catch (error) {
        console.error('Error starting audio recording:', error);
        
        if (error.name === 'NotAllowedError') {
            MainJS.showError('Microphone access denied. Please allow microphone access to record voice messages.');
        } else if (error.name === 'NotFoundError') {
            MainJS.showError('No microphone found. Please connect a microphone and try again.');
        } else {
            MainJS.showError('Failed to start recording: ' + error.message);
        }
        
        resetRecordingUI();
    }
}

function stopAudioRecording() {
    if (!isRecording || !mediaRecorder) {
        return;
    }
    
    try {
        mediaRecorder.stop();
        isRecording = false;
        
        // Stop all tracks
        if (recordingStream) {
            recordingStream.getTracks().forEach(track => track.stop());
            recordingStream = null;
        }
        
        // Stop timer
        if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
        }
        
        console.log('Audio recording stopped');
        
    } catch (error) {
        console.error('Error stopping audio recording:', error);
        MainJS.showError('Failed to stop recording');
        resetRecordingUI();
    }
}

function cancelAudioRecording() {
    if (isRecording && mediaRecorder) {
        mediaRecorder.stop();
        isRecording = false;
        
        // Stop all tracks
        if (recordingStream) {
            recordingStream.getTracks().forEach(track => track.stop());
            recordingStream = null;
        }
        
        // Stop timer
        if (recordingTimer) {
            clearInterval(recordingTimer);
            recordingTimer = null;
        }
        
        // Clear chunks
        audioChunks = [];
        
        // Reset UI
        resetRecordingUI();
        
        console.log('Audio recording cancelled');
    }
}

async function handleRecordingStop() {
    if (audioChunks.length === 0) {
        console.warn('No audio data recorded');
        resetRecordingUI();
        return;
    }
    
    try {
        // Create blob from chunks
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        const duration = (Date.now() - recordingStartTime) / 1000; // Duration in seconds
        
        // Validate minimum duration
        if (duration < 0.5) {
            MainJS.showError('Recording too short. Please record for at least 0.5 seconds.');
            resetRecordingUI();
            return;
        }
        
        // Validate maximum duration (5 minutes)
        if (duration > 300) {
            MainJS.showError('Recording too long. Maximum duration is 5 minutes.');
            resetRecordingUI();
            return;
        }
        
        console.log(`Audio recorded: ${duration.toFixed(2)} seconds, size: ${audioBlob.size} bytes`);
        
        // Upload audio
        await uploadAudioMessage(audioBlob, duration);
        
    } catch (error) {
        console.error('Error handling recording stop:', error);
        MainJS.showError('Failed to process recording');
    } finally {
        resetRecordingUI();
    }
}

async function uploadAudioMessage(audioBlob, duration) {
    if (!window.currentConversation) {
        MainJS.showError('No conversation selected');
        return;
    }
    
    try {
        // Create form data
        const formData = new FormData();
        formData.append('audio', audioBlob, 'voice_message.webm');
        formData.append('conversation_id', window.currentConversation);
        formData.append('duration', duration.toString());
        
        // Show uploading indicator
        MainJS.showSuccess('Sending voice message...');
        
        // Upload audio
        const response = await fetch('/api/upload_audio', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            MainJS.showSuccess('Voice message sent!');
            
            // Reload messages and conversations
            await loadMessages(window.currentConversation);
            await loadConversations();
        } else {
            MainJS.showError('Failed to send voice message: ' + result.message);
        }
        
    } catch (error) {
        console.error('Error uploading audio:', error);
        MainJS.showError('Failed to send voice message');
    }
}

function startRecordingTimer() {
    recordingTimer = setInterval(() => {
        if (!isRecording) return;
        
        const elapsed = (Date.now() - recordingStartTime) / 1000;
        const minutes = Math.floor(elapsed / 60);
        const seconds = Math.floor(elapsed % 60);
        
        const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        const timeElement = document.getElementById('recordingTime');
        if (timeElement) {
            timeElement.textContent = timeString;
        }
        
        // Auto-stop at 5 minutes
        if (elapsed >= 300) {
            stopAudioRecording();
        }
    }, 100);
}

function updateRecordingUI(recording) {
    const audioButton = document.getElementById('audioButton');
    const audioRecording = document.getElementById('audioRecording');
    const messageForm = document.getElementById('messageForm');
    
    if (!audioButton || !audioRecording || !messageForm) return;
    
    if (recording) {
        audioButton.innerHTML = '<i class="fas fa-stop text-danger"></i>';
        audioButton.classList.add('btn-danger');
        audioButton.classList.remove('btn-outline-success');
        audioRecording.style.display = 'block';
        messageForm.style.display = 'none';
    } else {
        resetRecordingUI();
    }
}

function resetRecordingUI() {
    const audioButton = document.getElementById('audioButton');
    const audioRecording = document.getElementById('audioRecording');
    const messageForm = document.getElementById('messageForm');
    const recordingTime = document.getElementById('recordingTime');
    
    if (audioButton) {
        audioButton.innerHTML = '<i class="fas fa-microphone"></i>';
        audioButton.classList.remove('btn-danger');
        audioButton.classList.add('btn-outline-success');
    }
    
    if (audioRecording) {
        audioRecording.style.display = 'none';
    }
    
    if (messageForm) {
        messageForm.style.display = 'flex';
    }
    
    if (recordingTime) {
        recordingTime.textContent = '00:00';
    }
}

// Audio playback functionality
const audioElements = new Map();

async function playAudioMessage(messageId) {
    try {
        // Stop any currently playing audio
        audioElements.forEach(audio => {
            if (!audio.paused) {
                audio.pause();
                audio.currentTime = 0;
            }
        });
        
        // Get or create audio element for this message
        let audio = audioElements.get(messageId);
        
        if (!audio) {
            // Fetch audio data
            const response = await fetch(`/api/download/${messageId}`);
            if (!response.ok) {
                throw new Error('Failed to load audio');
            }
            
            const blob = await response.blob();
            const audioUrl = URL.createObjectURL(blob);
            
            // Create audio element
            audio = new Audio(audioUrl);
            audioElements.set(messageId, audio);
            
            // Update play button when audio ends
            audio.addEventListener('ended', () => {
                updateAudioButton(messageId, false);
                URL.revokeObjectURL(audioUrl);
                audioElements.delete(messageId);
            });
            
            // Handle errors
            audio.addEventListener('error', (e) => {
                console.error('Audio playback error:', e);
                MainJS.showError('Failed to play audio message');
                updateAudioButton(messageId, false);
                URL.revokeObjectURL(audioUrl);
                audioElements.delete(messageId);
            });
        }
        
        // Toggle play/pause
        if (audio.paused) {
            updateAudioButton(messageId, true);
            await audio.play();
        } else {
            audio.pause();
            updateAudioButton(messageId, false);
        }
        
    } catch (error) {
        console.error('Error playing audio message:', error);
        MainJS.showError('Failed to play audio message');
    }
}

function updateAudioButton(messageId, playing) {
    const button = document.querySelector(`[onclick*="${messageId}"]`);
    if (button) {
        const icon = button.querySelector('i');
        if (icon) {
            if (playing) {
                icon.className = 'fas fa-pause';
                button.style.background = '#128c7e';
            } else {
                icon.className = 'fas fa-play';
                button.style.background = '#25d366';
            }
        }
    }
}

// Cleanup audio elements on page unload
window.addEventListener('beforeunload', () => {
    audioElements.forEach(audio => {
        if (!audio.paused) {
            audio.pause();
        }
        // URLs will be automatically revoked when the page unloads
    });
    audioElements.clear();
});

// Export functions for global access
window.AudioJS = {
    toggleAudioRecording,
    cancelAudioRecording,
    stopAudioRecording,
    playAudioMessage
};

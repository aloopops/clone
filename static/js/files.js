// File upload and management functionality

// Initialize file upload functionality
document.addEventListener('DOMContentLoaded', () => {
    if (document.body.classList.contains('chat-page')) {
        initializeFileUpload();
    }
});

function initializeFileUpload() {
    const fileInput = document.getElementById('fileInput');
    const imageInput = document.getElementById('imageInput');
    
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }
    
    if (imageInput) {
        imageInput.addEventListener('change', handleFileSelect);
    }
    
    // Handle drag and drop
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.addEventListener('dragover', handleDragOver);
        chatMessages.addEventListener('drop', handleFileDrop);
        chatMessages.addEventListener('dragenter', handleDragEnter);
        chatMessages.addEventListener('dragleave', handleDragLeave);
    }
    
    console.log('File upload initialized');
}

function openFileUpload() {
    if (!window.currentConversation) {
        MainJS.showError('Please select a conversation first');
        return;
    }
    
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.click();
    }
}

function openImageUpload() {
    if (!window.currentConversation) {
        MainJS.showError('Please select a conversation first');
        return;
    }
    
    const imageInput = document.getElementById('imageInput');
    if (imageInput) {
        imageInput.click();
    }
}

function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;
    
    // Reset input value to allow selecting the same file again
    event.target.value = '';
    
    files.forEach(file => {
        uploadFile(file);
    });
}

function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
}

function handleDragEnter(event) {
    event.preventDefault();
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.classList.add('drag-over');
    }
}

function handleDragLeave(event) {
    event.preventDefault();
    // Only remove class if we're leaving the chat messages area entirely
    if (!event.currentTarget.contains(event.relatedTarget)) {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.classList.remove('drag-over');
        }
    }
}

function handleFileDrop(event) {
    event.preventDefault();
    
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
        chatMessages.classList.remove('drag-over');
    }
    
    if (!window.currentConversation) {
        MainJS.showError('Please select a conversation first');
        return;
    }
    
    const files = Array.from(event.dataTransfer.files);
    files.forEach(file => {
        uploadFile(file);
    });
}

async function uploadFile(file) {
    if (!window.currentConversation) {
        MainJS.showError('Please select a conversation first');
        return;
    }
    
    // Validate file size (100MB limit)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
        MainJS.showError(`File "${file.name}" is too large. Maximum size is 100MB.`);
        return;
    }
    
    // Validate file type
    const allowedExtensions = [
        'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'mp3', 'wav', 'ogg', 'm4a',
        'mp4', 'avi', 'mov', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 
        'zip', 'rar', '7z', 'apk', 'exe', 'dmg', 'deb', 'rpm'
    ];
    
    const fileExtension = file.name.split('.').pop().toLowerCase();
    if (!allowedExtensions.includes(fileExtension)) {
        MainJS.showError(`File type "${fileExtension}" is not allowed.`);
        return;
    }
    
    // Create progress UI
    const progressId = createProgressUI(file);
    
    try {
        // Create form data
        const formData = new FormData();
        formData.append('file', file);
        formData.append('conversation_id', window.currentConversation);
        
        // Upload with progress tracking
        const response = await uploadWithProgress(formData, progressId);
        
        if (response.success) {
            updateProgressUI(progressId, 100, 'Upload complete');
            MainJS.showSuccess(`File "${file.name}" uploaded successfully!`);
            
            // Remove progress UI after a delay
            setTimeout(() => {
                removeProgressUI(progressId);
            }, 2000);
            
            // Reload messages and conversations
            await loadMessages(window.currentConversation);
            await loadConversations();
            
        } else {
            updateProgressUI(progressId, 0, 'Upload failed: ' + response.message);
            MainJS.showError('Failed to upload file: ' + response.message);
            
            // Remove progress UI after delay
            setTimeout(() => {
                removeProgressUI(progressId);
            }, 3000);
        }
        
    } catch (error) {
        console.error('Error uploading file:', error);
        updateProgressUI(progressId, 0, 'Upload failed');
        MainJS.showError('Failed to upload file: ' + error.message);
        
        // Remove progress UI after delay
        setTimeout(() => {
            removeProgressUI(progressId);
        }, 3000);
    }
}

function uploadWithProgress(formData, progressId) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percentComplete = (event.loaded / event.total) * 100;
                updateProgressUI(progressId, percentComplete, 'Uploading...');
            }
        });
        
        // Handle completion
        xhr.addEventListener('load', () => {
            try {
                const response = JSON.parse(xhr.responseText);
                resolve(response);
            } catch (error) {
                reject(new Error('Invalid response format'));
            }
        });
        
        // Handle errors
        xhr.addEventListener('error', () => {
            reject(new Error('Network error during upload'));
        });
        
        xhr.addEventListener('abort', () => {
            reject(new Error('Upload cancelled'));
        });
        
        // Start upload
        xhr.open('POST', '/api/upload_file');
        xhr.send(formData);
    });
}

function createProgressUI(file) {
    const progressId = 'progress_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const chatMessages = document.getElementById('chatMessages');
    
    if (!chatMessages) return progressId;
    
    const progressElement = document.createElement('div');
    progressElement.id = progressId;
    progressElement.className = 'upload-progress';
    
    const iconClass = MainJS.getFileIconClass(file.type);
    const iconColor = MainJS.getFileIconColor(file.type);
    
    progressElement.innerHTML = `
        <div class="d-flex align-items-center mb-2">
            <div class="file-icon ${iconColor} me-3">
                <i class="${iconClass}"></i>
            </div>
            <div class="flex-grow-1">
                <div class="fw-bold text-truncate">${MainJS.escapeHtml(file.name)}</div>
                <small class="text-muted">${MainJS.formatFileSize(file.size)}</small>
            </div>
        </div>
        <div class="progress mb-2" style="height: 4px;">
            <div class="progress-bar bg-success" role="progressbar" style="width: 0%"></div>
        </div>
        <div class="progress-status small text-muted">Preparing upload...</div>
    `;
    
    chatMessages.appendChild(progressElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return progressId;
}

function updateProgressUI(progressId, percent, status) {
    const progressElement = document.getElementById(progressId);
    if (!progressElement) return;
    
    const progressBar = progressElement.querySelector('.progress-bar');
    const statusElement = progressElement.querySelector('.progress-status');
    
    if (progressBar) {
        progressBar.style.width = percent + '%';
        progressBar.setAttribute('aria-valuenow', percent);
    }
    
    if (statusElement) {
        statusElement.textContent = status;
    }
    
    // Change color based on status
    if (status.includes('failed') || status.includes('error')) {
        if (progressBar) {
            progressBar.classList.remove('bg-success');
            progressBar.classList.add('bg-danger');
        }
        if (statusElement) {
            statusElement.classList.add('text-danger');
        }
    } else if (status.includes('complete')) {
        if (progressBar) {
            progressBar.classList.remove('bg-success');
            progressBar.classList.add('bg-success');
        }
        if (statusElement) {
            statusElement.classList.add('text-success');
        }
    }
}

function removeProgressUI(progressId) {
    const progressElement = document.getElementById(progressId);
    if (progressElement) {
        progressElement.remove();
    }
}

// File preview functionality
function previewFile(fileUrl, fileName, fileType) {
    if (fileType.startsWith('image/')) {
        showImagePreview(fileUrl, fileName);
    } else if (fileType.startsWith('text/') || fileType.includes('pdf')) {
        window.open(fileUrl, '_blank');
    } else {
        // For other file types, just download
        downloadFileFromUrl(fileUrl, fileName);
    }
}

function showImagePreview(imageUrl, fileName) {
    // Create modal for image preview
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.setAttribute('tabindex', '-1');
    
    modal.innerHTML = `
        <div class="modal-dialog modal-lg modal-dialog-centered">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">${MainJS.escapeHtml(fileName)}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body text-center">
                    <img src="${imageUrl}" alt="${MainJS.escapeHtml(fileName)}" class="img-fluid" style="max-height: 70vh;">
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    <button type="button" class="btn btn-success" onclick="downloadFileFromUrl('${imageUrl}', '${fileName}')">
                        <i class="fas fa-download me-2"></i>Download
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Show modal
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    
    // Remove modal from DOM when hidden
    modal.addEventListener('hidden.bs.modal', () => {
        modal.remove();
    });
}

function downloadFileFromUrl(url, fileName) {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// File type validation
function validateFileType(file) {
    const allowedTypes = [
        // Images
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        // Audio
        'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a',
        // Video
        'video/mp4', 'video/avi', 'video/quicktime', 'video/webm',
        // Documents
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        // Archives
        'application/zip',
        'application/x-rar-compressed',
        'application/x-7z-compressed',
        // Text
        'text/plain',
        // Applications
        'application/vnd.android.package-archive'
    ];
    
    return allowedTypes.includes(file.type) || file.type === '';
}

// File size formatting (already available in main.js, but keeping for reference)
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Add CSS for drag and drop visual feedback
const dragDropStyles = document.createElement('style');
dragDropStyles.textContent = `
    .chat-messages.drag-over {
        border: 2px dashed #25d366;
        background-color: rgba(37, 211, 102, 0.1);
    }
    
    .chat-messages.drag-over::after {
        content: "Drop files here to upload";
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(37, 211, 102, 0.9);
        color: white;
        padding: 1rem 2rem;
        border-radius: 8px;
        font-weight: bold;
        z-index: 1000;
        pointer-events: none;
    }
`;
document.head.appendChild(dragDropStyles);

// Export functions for global access
window.FileJS = {
    openFileUpload,
    openImageUpload,
    uploadFile,
    previewFile,
    validateFileType,
    formatFileSize
};

// Main JavaScript utilities and helpers

// Global variables
window.currentUser = null;
window.currentConversation = null;

// Utility functions
function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) { // Less than 1 minute
        return 'now';
    } else if (diff < 3600000) { // Less than 1 hour
        return Math.floor(diff / 60000) + 'm';
    } else if (diff < 86400000) { // Less than 1 day
        return Math.floor(diff / 3600000) + 'h';
    } else {
        return date.toLocaleDateString();
    }
}

function formatMessageTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showToast(message, type = 'info') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type === 'error' ? 'danger' : 'success'} border-0`;
    toast.setAttribute('role', 'alert');
    
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">
                ${escapeHtml(message)}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;
    
    // Add to page
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
        document.body.appendChild(toastContainer);
    }
    
    toastContainer.appendChild(toast);
    
    // Show toast
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
    
    // Remove from DOM after hidden
    toast.addEventListener('hidden.bs.toast', () => {
        toast.remove();
    });
}

function showError(message) {
    showToast(message, 'error');
}

function showSuccess(message) {
    showToast(message, 'success');
}

// API helper functions
async function apiRequest(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
}

// File helper functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileIconClass(fileType) {
    if (fileType.startsWith('image/')) return 'fas fa-image';
    if (fileType.startsWith('audio/')) return 'fas fa-music';
    if (fileType.startsWith('video/')) return 'fas fa-video';
    if (fileType.includes('pdf')) return 'fas fa-file-pdf';
    if (fileType.includes('word') || fileType.includes('document')) return 'fas fa-file-word';
    if (fileType.includes('excel') || fileType.includes('sheet')) return 'fas fa-file-excel';
    if (fileType.includes('powerpoint') || fileType.includes('presentation')) return 'fas fa-file-powerpoint';
    if (fileType.includes('zip') || fileType.includes('archive') || fileType.includes('rar') || fileType.includes('7z')) return 'fas fa-file-archive';
    if (fileType.includes('apk')) return 'fab fa-android';
    return 'fas fa-file';
}

function getFileIconColor(fileType) {
    if (fileType.startsWith('image/')) return 'image';
    if (fileType.startsWith('audio/')) return 'audio';
    if (fileType.startsWith('video/')) return 'video';
    if (fileType.includes('pdf')) return 'pdf';
    if (fileType.includes('word') || fileType.includes('document')) return 'document';
    if (fileType.includes('excel') || fileType.includes('sheet')) return 'document';
    if (fileType.includes('powerpoint') || fileType.includes('presentation')) return 'document';
    if (fileType.includes('zip') || fileType.includes('archive') || fileType.includes('rar') || fileType.includes('7z')) return 'archive';
    if (fileType.includes('apk')) return 'apk';
    return 'default';
}

// Online status management
let statusUpdateInterval;

function startStatusUpdates() {
    // Update online status every 30 seconds
    statusUpdateInterval = setInterval(updateOnlineStatus, 30000);
    
    // Update on page visibility change
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            updateOnlineStatus();
        }
    });
    
    // Update on page unload
    window.addEventListener('beforeunload', () => {
        updateOnlineStatus(false);
    });
    
    // Initial update
    updateOnlineStatus();
}

async function updateOnlineStatus(online = true) {
    try {
        await apiRequest('/api/update_status', {
            method: 'POST',
            body: JSON.stringify({ online })
        });
    } catch (error) {
        console.error('Failed to update online status:', error);
    }
}

function stopStatusUpdates() {
    if (statusUpdateInterval) {
        clearInterval(statusUpdateInterval);
        statusUpdateInterval = null;
    }
}

// Initialize common functionality
document.addEventListener('DOMContentLoaded', () => {
    // Start status updates if on chat page
    if (document.body.classList.contains('chat-page')) {
        startStatusUpdates();
        
        // Handle mobile keyboard viewport changes
        if (/Mobi|Android/i.test(navigator.userAgent)) {
            handleMobileViewport();
        }
    }
    
    // Handle page unload
    window.addEventListener('beforeunload', () => {
        stopStatusUpdates();
    });
});

// Handle mobile viewport changes when keyboard appears/disappears
function handleMobileViewport() {
    let initialViewportHeight = window.innerHeight;
    
    window.addEventListener('resize', () => {
        const currentHeight = window.innerHeight;
        const chatMessages = document.getElementById('chatMessages');
        
        if (chatMessages) {
            // If keyboard is shown (viewport shrunk significantly)
            if (currentHeight < initialViewportHeight * 0.75) {
                // Scroll to bottom when keyboard appears
                setTimeout(() => {
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }, 300);
            }
        }
    });
    
    // Handle visual viewport API if available
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
            const chatMessages = document.getElementById('chatMessages');
            if (chatMessages) {
                setTimeout(() => {
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }, 100);
            }
        });
    }
}

// Export functions for use in other scripts
window.MainJS = {
    formatTime,
    formatMessageTime,
    escapeHtml,
    showToast,
    showError,
    showSuccess,
    apiRequest,
    formatFileSize,
    getFileIconClass,
    getFileIconColor,
    updateOnlineStatus
};

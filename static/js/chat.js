// Chat functionality
let conversations = [];
let messages = {};
let pollingInterval;

// Mobile sidebar functionality
function toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (sidebar && overlay) {
        sidebar.classList.toggle('show');
        overlay.classList.toggle('show');
        
        // Prevent body scroll when sidebar is open
        if (sidebar.classList.contains('show')) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    }
}

// Close mobile sidebar when clicking outside
function closeMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (sidebar && overlay) {
        sidebar.classList.remove('show');
        overlay.classList.remove('show');
        document.body.style.overflow = '';
    }
}

// Initialize chat functionality
document.addEventListener('DOMContentLoaded', () => {
    if (!document.body.classList.contains('chat-page')) {
        return;
    }
    
    initializeChat();
});

async function initializeChat() {
    try {
        console.log('Initializing chat...');
        
        // Clear any existing data
        conversations = [];
        messages = {};
        window.currentConversation = null;
        
        // Load fresh data
        await loadConversations();
        startPolling();
        setupEventListeners();
        
        console.log('Chat initialized successfully');
    } catch (error) {
        console.error('Failed to initialize chat:', error);
        MainJS.showError('Failed to initialize chat');
    }
}

function setupEventListeners() {
    // Message form
    const messageForm = document.getElementById('messageForm');
    if (messageForm) {
        messageForm.addEventListener('submit', handleSendMessage);
    }
    
    // Private chat form
    const privateChatForm = document.getElementById('privateChatForm');
    if (privateChatForm) {
        privateChatForm.addEventListener('submit', handleStartPrivateChat);
    }
    
    // Group chat form
    const groupChatForm = document.getElementById('groupChatForm');
    if (groupChatForm) {
        groupChatForm.addEventListener('submit', handleCreateGroup);
    }
}

async function loadConversations() {
    try {
        const response = await MainJS.apiRequest('/api/conversations');
        
        if (response.success) {
            conversations = response.conversations || [];
            renderConversations();
        } else {
            console.warn('Failed to load conversations:', response.message);
            // Show empty state instead of error for unauthenticated users
            conversations = [];
            renderConversations();
        }
    } catch (error) {
        console.error('Failed to load conversations:', error);
        conversations = [];
        renderConversations();
    }
}

function renderConversations() {
    const conversationsList = document.getElementById('conversationsList');
    if (!conversationsList) {
        console.error('Conversations list element not found');
        return;
    }
    
    console.log('Rendering conversations:', conversations);
    
    // FORCE CLEAR the conversations list first
    conversationsList.innerHTML = '';
    
    if (conversations.length === 0) {
        conversationsList.innerHTML = `
            <div class="text-center p-4 text-muted">
                <i class="fas fa-comments mb-3" style="font-size: 2rem;"></i>
                <p>No conversations yet</p>
                <small>Start a new chat to begin messaging</small>
            </div>
        `;
        console.log('No conversations to display');
        return;
    }
    
    conversationsList.innerHTML = conversations.map(conv => {
        const lastMessage = conv.last_message;
        const isActive = window.currentConversation === conv.id;
        
        return `
            <div class="conversation-item ${isActive ? 'active' : ''}" onclick="selectConversation('${conv.id}')">
                <div class="d-flex align-items-center">
                    <div class="avatar bg-success me-3 position-relative">
                        ${conv.type === 'group' ? '<i class="fas fa-users"></i>' : conv.name[0].toUpperCase()}
                        ${conv.type === 'private' && conv.online ? '<div class="online-indicator"></div>' : ''}
                    </div>
                    <div class="flex-grow-1">
                        <div class="d-flex justify-content-between align-items-start">
                            <div class="fw-bold">${MainJS.escapeHtml(conv.name)}</div>
                            ${lastMessage ? `<small class="text-muted">${MainJS.formatTime(lastMessage.timestamp)}</small>` : ''}
                        </div>
                        ${lastMessage ? `
                            <div class="text-muted small text-truncate">
                                ${conv.type === 'group' ? `${MainJS.escapeHtml(lastMessage.sender_name)}: ` : ''}
                                ${MainJS.escapeHtml(lastMessage.content)}
                            </div>
                        ` : '<div class="text-muted small">No messages yet</div>'}
                        ${conv.type === 'private' && !conv.online ? '<div class="text-offline small">offline</div>' : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function selectConversation(conversationId) {
    try {
        console.log('Selecting conversation:', conversationId);
        
        // Validate that conversation exists
        const conversation = conversations.find(c => c.id === conversationId);
        if (!conversation) {
            console.error('Conversation not found:', conversationId);
            MainJS.showError('Conversation not found. Please refresh and try again.');
            return;
        }
        
        window.currentConversation = conversationId;
        
        // Update UI
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Find and activate the clicked conversation
        const clickedItem = document.querySelector(`[onclick*="${conversationId}"]`);
        if (clickedItem) {
            clickedItem.classList.add('active');
        }
        
        // Show chat container
        const welcomeScreen = document.getElementById('welcomeScreen');
        const chatContainer = document.getElementById('chatContainer');
        
        if (welcomeScreen) welcomeScreen.style.display = 'none';
        if (chatContainer) {
            chatContainer.style.display = 'flex';
            console.log('Chat container displayed');
        } else {
            console.error('Chat container not found');
        }
        
        // Close mobile sidebar when conversation is selected
        if (window.innerWidth < 768) {
            closeMobileSidebar();
        }
        
        // Update chat header first
        updateChatHeader(conversationId);
        
        // Load conversation details with local storage for instant loading
        console.log('Loading messages for conversation:', conversationId);
        await loadMessagesWithLocalStorage(conversationId);
        
        // Mark messages as seen
        markMessagesAsSeen(conversationId);
        
        console.log('Conversation selected successfully');
    } catch (error) {
        console.error('Error selecting conversation:', error);
        MainJS.showError('Failed to load conversation');
    }
}

async function loadMessages(conversationId) {
    try {
        console.log('Loading messages for conversation ID:', conversationId);
        const response = await MainJS.apiRequest(`/api/messages/${conversationId}`);
        console.log('Messages API response:', response);
        
        if (response.success) {
            messages[conversationId] = response.messages || [];
            console.log('Messages loaded:', response.messages.length);
            
            // Save messages to local storage
            saveMessagesToLocalStorage(conversationId, messages[conversationId]);
            
            renderMessages(conversationId);
        } else {
            console.error('API error:', response.message);
            // Even if API fails, show the chat interface with empty state
            messages[conversationId] = [];
            renderMessages(conversationId);
            MainJS.showError('Failed to load messages: ' + response.message);
        }
    } catch (error) {
        console.error('Failed to load messages:', error);
        // Show empty chat interface even on error
        messages[conversationId] = [];
        renderMessages(conversationId);
        MainJS.showError('Connection error while loading messages');
    }
}

function renderMessages(conversationId) {
    console.log('Rendering messages for conversation:', conversationId);
    const chatMessages = document.getElementById('chatMessages');
    console.log('Chat messages element:', chatMessages);
    console.log('Messages data:', messages[conversationId]);
    
    if (!chatMessages) {
        console.error('Chat messages element not found!');
        return;
    }
    
    if (!messages[conversationId]) {
        console.error('No messages found for conversation:', conversationId);
        return;
    }
    
    const conversationMessages = messages[conversationId];
    console.log('Number of messages to render:', conversationMessages.length);
    
    if (conversationMessages.length === 0) {
        console.log('No messages, showing empty state');
        chatMessages.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-comment-dots mb-2" style="font-size: 2rem;"></i>
                <p>No messages yet</p>
                <small>Send the first message to start the conversation</small>
            </div>
        `;
        return;
    }
    
    chatMessages.innerHTML = conversationMessages.map(msg => {
        const isCurrentUser = msg.sender_id === getCurrentUserId();
        const messageClass = isCurrentUser ? 'sent' : 'received';
        
        // Render different message types
        if (msg.message_type === 'image') {
            return renderImageMessage(msg, messageClass);
        } else if (msg.message_type === 'file') {
            return renderFileMessage(msg, messageClass);
        } else if (msg.message_type === 'audio') {
            return renderAudioMessage(msg, messageClass);
        } else {
            return renderTextMessage(msg, messageClass);
        }
    }).join('');
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Mark messages as seen when viewing conversation
    setTimeout(() => markVisibleMessagesAsSeen(), 500);
}

function renderTextMessage(msg, messageClass) {
    const isCurrentUser = messageClass === 'sent';
    return `
        <div class="message-item ${messageClass}">
            <div class="message-content">
                ${!isCurrentUser && getConversationType(window.currentConversation) === 'group' ? 
                    `<div class="small text-muted mb-1">${MainJS.escapeHtml(msg.sender_name)}</div>` : ''}
                <div class="message-bubble">
                    ${MainJS.escapeHtml(msg.content)}
                </div>
                <div class="message-time">
                    ${MainJS.formatMessageTime(msg.timestamp)}
                    ${isCurrentUser ? getMessageStatusIcon(msg) : ''}
                </div>
            </div>
        </div>
    `;
}

function renderImageMessage(msg, messageClass) {
    const isCurrentUser = messageClass === 'sent';
    return `
        <div class="message-item ${messageClass}">
            <div class="message-content">
                ${!isCurrentUser && getConversationType(window.currentConversation) === 'group' ? 
                    `<div class="small text-muted mb-1">${MainJS.escapeHtml(msg.sender_name)}</div>` : ''}
                <div class="image-message ${messageClass}" onclick="openImagePreview('${msg.id}')">
                    <img src="/api/image/${msg.id}" alt="${MainJS.escapeHtml(msg.file_name || 'Image')}" 
                         class="message-image" loading="lazy">
                    <div class="image-overlay">
                        <i class="fas fa-search-plus"></i>
                    </div>
                </div>
                <div class="message-time">
                    ${MainJS.formatMessageTime(msg.timestamp)}
                    ${isCurrentUser ? getMessageStatusIcon(msg) : ''}
                </div>
            </div>
        </div>
    `;
}

function renderFileMessage(msg, messageClass) {
    const isCurrentUser = messageClass === 'sent';
    const iconClass = MainJS.getFileIconClass(msg.file_type || '');
    const iconColor = MainJS.getFileIconColor(msg.file_type || '');
    
    return `
        <div class="message-item ${messageClass}">
            <div class="message-content">
                ${!isCurrentUser && getConversationType(window.currentConversation) === 'group' ? 
                    `<div class="small text-muted mb-1">${MainJS.escapeHtml(msg.sender_name)}</div>` : ''}
                <div class="file-message ${messageClass}" onclick="downloadFile('${msg.id}')">
                    <div class="file-info">
                        <div class="file-icon ${iconColor}">
                            <i class="${iconClass}"></i>
                        </div>
                        <div class="file-details">
                            <div class="file-name">${MainJS.escapeHtml(msg.file_name || 'Unknown File')}</div>
                            <div class="file-size">${msg.file_size_formatted || '0B'}</div>
                        </div>
                    </div>
                </div>
                <div class="message-time">
                    ${MainJS.formatMessageTime(msg.timestamp)}
                    ${isCurrentUser ? getMessageStatusIcon(msg) : ''}
                </div>
            </div>
        </div>
    `;
}

function renderAudioMessage(msg, messageClass) {
    const isCurrentUser = messageClass === 'sent';
    const duration = msg.audio_duration ? Math.floor(msg.audio_duration) : 0;
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    const durationText = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    return `
        <div class="message-item ${messageClass}">
            <div class="message-content">
                ${!isCurrentUser && getConversationType(window.currentConversation) === 'group' ? 
                    `<div class="small text-muted mb-1">${MainJS.escapeHtml(msg.sender_name)}</div>` : ''}
                <div class="audio-message ${messageClass}">
                    <div class="audio-controls">
                        <button class="audio-play-btn" onclick="playAudioMessage('${msg.id}')">
                            <i class="fas fa-play"></i>
                        </button>
                        <div class="audio-waveform"></div>
                        <div class="audio-duration">${durationText}</div>
                    </div>
                </div>
                <div class="message-time">
                    ${MainJS.formatMessageTime(msg.timestamp)}
                    ${isCurrentUser ? getMessageStatusIcon(msg) : ''}
                </div>
            </div>
        </div>
    `;
}

function getMessageStatusIcon(message) {
    // FIXED: Proper blue tick logic
    // Blue ticks ONLY when recipient is ONLINE AND has actually seen the message
    // Gray ticks when delivered but not seen OR when recipient is offline
    
    const seenCount = message.seen_by ? message.seen_by.length : 0;
    const currentUserId = document.querySelector('[data-user-id]')?.getAttribute('data-user-id');
    
    // For group chats, check if any non-sender has seen it while online
    const conversation = conversations.find(c => c.id === window.currentConversation);
    if (!conversation) {
        // Default to single gray tick if can't find conversation
        return '<span class="message-status sent"><i class="fas fa-check"></i></span>';
    }
    
    // Check if ANY recipient is currently online AND has seen the message
    const hasOnlineRecipientSeen = conversation.participants.some(participant => {
        return participant.id !== currentUserId && // Not the sender
               participant.online === true && // Currently online
               message.seen_by && message.seen_by.includes(participant.id); // Has seen the message
    });
    
    if (hasOnlineRecipientSeen) {
        // Blue double tick: seen by online recipient
        return '<span class="message-status seen"><i class="fas fa-check-double"></i></span>';
    } else if (seenCount > 0) {
        // Gray double tick: seen but recipient was offline or is offline now
        return '<span class="message-status delivered"><i class="fas fa-check-double"></i></span>';
    } else {
        // Single gray tick: delivered but not seen
        return '<span class="message-status sent"><i class="fas fa-check"></i></span>';
    }
}

function updateChatHeader(conversationId) {
    const chatHeader = document.getElementById('chatHeader');
    const conversation = conversations.find(c => c.id === conversationId);
    
    if (!chatHeader || !conversation) return;
    
    chatHeader.innerHTML = `
        <div class="d-flex align-items-center">
            <div class="avatar bg-success me-3 position-relative">
                ${conversation.type === 'group' ? '<i class="fas fa-users"></i>' : conversation.name[0].toUpperCase()}
                ${conversation.type === 'private' && conversation.online ? '<div class="online-indicator"></div>' : ''}
            </div>
            <div>
                <div class="fw-bold">${MainJS.escapeHtml(conversation.name)}</div>
                <small>
                    ${conversation.type === 'group' 
                        ? `${conversation.participants.length} members`
                        : conversation.online ? 'online' : 'offline'
                    }
                </small>
            </div>
        </div>
    `;
}

async function handleSendMessage(event) {
    event.preventDefault();
    
    const messageInput = document.getElementById('messageInput');
    const content = messageInput.value.trim();
    
    if (!content || !window.currentConversation) {
        return;
    }
    
    try {
        const response = await MainJS.apiRequest('/api/send_message', {
            method: 'POST',
            body: JSON.stringify({
                conversation_id: window.currentConversation,
                content: content
            })
        });
        
        if (response.success) {
            messageInput.value = '';
            
            // Add message to local state for instant display (zero delay like your reference code)
            if (!messages[window.currentConversation]) {
                messages[window.currentConversation] = [];
            }
            messages[window.currentConversation].push(response.message);
            
            // Save messages to local storage
            saveMessagesToLocalStorage(window.currentConversation, messages[window.currentConversation]);
            
            // Render messages instantly for fast response - no setTimeout delays
            requestAnimationFrame(() => {
                renderMessages(window.currentConversation);
            });
            
            // Update conversations list
            await loadConversations();
        } else {
            MainJS.showError('Failed to send message: ' + response.message);
        }
    } catch (error) {
        console.error('Error sending message:', error);
        MainJS.showError('Failed to send message');
    }
}

// File download function
async function downloadFile(messageId) {
    try {
        window.open(`/api/download/${messageId}`, '_blank');
    } catch (error) {
        console.error('Error downloading file:', error);
        MainJS.showError('Failed to download file');
    }
}

// Audio playback function
async function playAudioMessage(messageId) {
    try {
        const response = await fetch(`/api/download/${messageId}`);
        if (response.ok) {
            const blob = await response.blob();
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            
            audio.play().catch(error => {
                console.error('Error playing audio:', error);
                MainJS.showError('Failed to play audio');
            });
            
            // Clean up URL when audio ends
            audio.addEventListener('ended', () => {
                URL.revokeObjectURL(audioUrl);
            });
        }
    } catch (error) {
        console.error('Error playing audio:', error);
        MainJS.showError('Failed to play audio');
    }
}

// Helper functions
function getCurrentUserId() {
    return window.currentUserId;
}

function getConversationType(conversationId) {
    const conversation = conversations.find(c => c.id === conversationId);
    return conversation ? conversation.type : 'private';
}

async function markMessagesAsSeen(conversationId) {
    try {
        // Get all message IDs from current conversation
        const conversationMessages = messages[conversationId] || [];
        const messageIds = conversationMessages.map(msg => msg.id);
        
        if (messageIds.length > 0) {
            await MainJS.apiRequest('/api/mark_seen', {
                method: 'POST',
                body: JSON.stringify({
                    message_ids: messageIds
                })
            });
        }
    } catch (error) {
        console.error('Failed to mark messages as seen:', error);
    }
}

function startPolling() {
    // Poll for new messages every 1 second for instant response like your original code
    pollingInterval = setInterval(async () => {
        try {
            // Reload conversations to get latest messages
            await loadConversations();
            
            // If a conversation is selected, reload its messages
            if (window.currentConversation) {
                await loadMessages(window.currentConversation);
                markMessagesAsSeen(window.currentConversation);
            }
        } catch (error) {
            console.error('Polling error:', error);
        }
    }, 1000);
}

// New chat functions
function startPrivateChat() {
    const newChatModal = bootstrap.Modal.getInstance(document.getElementById('newChatModal'));
    const privateChatModal = new bootstrap.Modal(document.getElementById('privateChatModal'));
    
    newChatModal.hide();
    privateChatModal.show();
}

function startGroupChat() {
    const newChatModal = bootstrap.Modal.getInstance(document.getElementById('newChatModal'));
    const groupChatModal = new bootstrap.Modal(document.getElementById('groupChatModal'));
    
    newChatModal.hide();
    groupChatModal.show();
}

async function findUser() {
    const userIdInput = document.getElementById('userIdInput');
    const uniqueId = userIdInput.value.trim().toUpperCase();
    
    if (!uniqueId) {
        MainJS.showError('Please enter a user ID');
        return;
    }
    
    try {
        const response = await MainJS.apiRequest('/api/find_user', {
            method: 'POST',
            body: JSON.stringify({ unique_id: uniqueId })
        });
        
        const userPreview = document.getElementById('userPreview');
        const startChatBtn = document.getElementById('startChatBtn');
        
        if (response.success) {
            userPreview.innerHTML = `
                <div class="d-flex align-items-center">
                    <div class="avatar bg-success me-3">${response.user.name[0].toUpperCase()}</div>
                    <div>
                        <div class="fw-bold">${MainJS.escapeHtml(response.user.name)}</div>
                        <small class="text-muted">${response.user.unique_id}</small>
                    </div>
                </div>
            `;
            userPreview.style.display = 'block';
            startChatBtn.style.display = 'block';
            startChatBtn.dataset.userId = response.user.user_id;
        } else {
            userPreview.innerHTML = `<div class="text-danger">${response.message}</div>`;
            userPreview.style.display = 'block';
            startChatBtn.style.display = 'none';
        }
    } catch (error) {
        console.error('Error finding user:', error);
        MainJS.showError('Failed to find user');
    }
}

async function handleStartPrivateChat(event) {
    event.preventDefault();
    
    const startChatBtn = document.getElementById('startChatBtn');
    const userId = startChatBtn.dataset.userId;
    
    if (!userId) {
        MainJS.showError('Please find a user first');
        return;
    }
    
    try {
        const response = await MainJS.apiRequest('/api/start_private_chat', {
            method: 'POST',
            body: JSON.stringify({ user_id: userId })
        });
        
        if (response.success) {
            const privateChatModal = bootstrap.Modal.getInstance(document.getElementById('privateChatModal'));
            privateChatModal.hide();
            
            // Refresh conversations and select the new one
            await loadConversations();
            await selectConversation(response.conversation_id);
        } else {
            MainJS.showError('Failed to start chat: ' + response.message);
        }
    } catch (error) {
        console.error('Error starting private chat:', error);
        MainJS.showError('Failed to start chat');
    }
}

async function handleCreateGroup(event) {
    event.preventDefault();
    
    const groupName = document.getElementById('groupNameInput').value.trim();
    const memberInputs = document.querySelectorAll('.member-input');
    const members = Array.from(memberInputs)
        .map(input => input.value.trim().toUpperCase())
        .filter(value => value);
    
    if (!groupName) {
        MainJS.showError('Please enter a group name');
        return;
    }
    
    if (members.length === 0) {
        MainJS.showError('Please add at least one member');
        return;
    }
    
    try {
        const response = await MainJS.apiRequest('/api/create_group', {
            method: 'POST',
            body: JSON.stringify({
                name: groupName,
                members: members
            })
        });
        
        if (response.success) {
            const groupChatModal = bootstrap.Modal.getInstance(document.getElementById('groupChatModal'));
            groupChatModal.hide();
            
            // Reset form
            document.getElementById('groupChatForm').reset();
            
            // Refresh conversations and select the new one
            await loadConversations();
            await selectConversation(response.conversation_id);
        } else {
            MainJS.showError('Failed to create group: ' + response.message);
        }
    } catch (error) {
        console.error('Error creating group:', error);
        MainJS.showError('Failed to create group');
    }
}

function addMemberField() {
    const groupMembers = document.getElementById('groupMembers');
    const memberCount = groupMembers.querySelectorAll('.member-input').length;
    
    if (memberCount >= 9) {
        MainJS.showError('Maximum 9 members allowed');
        return;
    }
    
    const memberField = document.createElement('div');
    memberField.className = 'input-group mb-2';
    memberField.innerHTML = `
        <input type="text" class="form-control member-input" placeholder="Enter user ID">
        <button type="button" class="btn btn-outline-danger" onclick="removeMemberField(this)">
            <i class="fas fa-minus"></i>
        </button>
    `;
    
    groupMembers.appendChild(memberField);
}

function removeMemberField(button) {
    button.parentElement.remove();
}

// Image preview functionality (WhatsApp-like) - SIMPLIFIED TO PREVENT TOUCH ISSUES
function openImagePreview(messageId) {
    // Remove any existing image preview first
    const existingModal = document.querySelector('.image-preview-modal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const imageUrl = `/api/image/${messageId}`;
    
    // Create simple modal with minimal interference
    const modal = document.createElement('div');
    modal.className = 'image-preview-modal';
    modal.innerHTML = `
        <div class="image-preview-overlay">
            <div class="image-preview-container">
                <button class="image-preview-close" onclick="closeImagePreview()">
                    <i class="fas fa-times"></i>
                </button>
                <img src="${imageUrl}" alt="Image Preview" class="image-preview-image">
                <div class="image-preview-actions">
                    <a href="/api/download/${messageId}" target="_blank" class="btn btn-outline-light">
                        <i class="fas fa-download"></i> Download
                    </a>
                </div>
            </div>
        </div>
    `;
    
    // Simple modal without any complex touch handling
    document.body.appendChild(modal);
    
    // Add click to close functionality
    modal.querySelector('.image-preview-overlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            closeImagePreview();
        }
    });
    
    // Mark message as seen when viewing image
    markMessageAsSeen(messageId);
}

function closeImagePreview() {
    // Simple close function - just remove modal, no complex touch handling
    const modal = document.querySelector('.image-preview-modal');
    if (modal) {
        modal.remove();
        console.log('Image preview closed');
    }
}

// Touch event prevention function for modal
function preventTouch(e) {
    e.preventDefault();
}

// Double blue tick system - Mark messages as seen
async function markMessageAsSeen(messageId) {
    try {
        await MainJS.apiRequest('/api/mark_seen', {
            method: 'POST',
            body: JSON.stringify({ message_ids: [messageId] })
        });
    } catch (error) {
        console.error('Error marking message as seen:', error);
    }
}

// Mark all visible messages as seen
async function markVisibleMessagesAsSeen() {
    if (!window.currentConversation) return;
    
    const conversationMessages = messages[window.currentConversation] || [];
    const messageIds = conversationMessages
        .filter(msg => msg.sender_id !== getCurrentUserId()) // Only mark messages from others
        .map(msg => msg.id);
    
    if (messageIds.length > 0) {
        try {
            await MainJS.apiRequest('/api/mark_seen', {
                method: 'POST',
                body: JSON.stringify({ message_ids: messageIds })
            });
        } catch (error) {
            console.error('Error marking messages as seen:', error);
        }
    }
}

// Update message status (for double blue tick display)
async function updateMessageStatuses() {
    if (!window.currentConversation) return;
    
    const conversationMessages = messages[window.currentConversation] || [];
    const currentUserId = getCurrentUserId();
    
    // Only check status for messages sent by current user
    const sentMessages = conversationMessages.filter(msg => msg.sender_id === currentUserId);
    
    for (const message of sentMessages) {
        try {
            const response = await MainJS.apiRequest(`/api/message_status/${message.id}`);
            if (response.success) {
                message.status = response.status;
            }
        } catch (error) {
            console.error('Error updating message status:', error);
        }
    }
}

// Local Storage Functions
function saveMessagesToLocalStorage(conversationId, messageList) {
    try {
        const storageKey = `chat_messages_${conversationId}`;
        localStorage.setItem(storageKey, JSON.stringify(messageList));
        console.log(`Saved ${messageList.length} messages to local storage for conversation ${conversationId}`);
    } catch (error) {
        console.error('Failed to save messages to local storage:', error);
    }
}

function loadMessagesFromLocalStorage(conversationId) {
    try {
        const storageKey = `chat_messages_${conversationId}`;
        const stored = localStorage.getItem(storageKey);
        const messages = stored ? JSON.parse(stored) : [];
        console.log(`Loaded ${messages.length} messages from local storage for conversation ${conversationId}`);
        return messages;
    } catch (error) {
        console.error('Failed to load messages from local storage:', error);
        return [];
    }
}

function clearLocalStorageForConversation(conversationId) {
    try {
        const storageKey = `chat_messages_${conversationId}`;
        localStorage.removeItem(storageKey);
    } catch (error) {
        console.error('Failed to clear local storage:', error);
    }
}

// Load messages from local storage first, then update from server
async function loadMessagesWithLocalStorage(conversationId) {
    try {
        console.log('Loading messages with local storage for:', conversationId);
        
        // First show cached messages for instant loading
        const cachedMessages = loadMessagesFromLocalStorage(conversationId);
        console.log('Cached messages loaded:', cachedMessages.length);
        
        if (cachedMessages.length > 0) {
            messages[conversationId] = cachedMessages;
            renderMessages(conversationId);
            console.log('Rendered cached messages');
        }
        
        // Then load fresh messages from server
        console.log('Loading fresh messages from server...');
        await loadMessages(conversationId);
        
    } catch (error) {
        console.error('Error in loadMessagesWithLocalStorage:', error);
        // Fallback to regular loading
        await loadMessages(conversationId);
    }
}

// Mobile sidebar functions
function toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (sidebar && overlay) {
        sidebar.classList.toggle('show');
        overlay.classList.toggle('show');
    }
}

function closeMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    
    if (sidebar && overlay) {
        sidebar.classList.remove('show');
        overlay.classList.remove('show');
    }
}

// Chat creation functions
function startPrivateChat() {
    // Close new chat modal and open private chat modal
    const newChatModal = bootstrap.Modal.getInstance(document.getElementById('newChatModal'));
    const privateChatModal = new bootstrap.Modal(document.getElementById('privateChatModal'));
    
    if (newChatModal) newChatModal.hide();
    privateChatModal.show();
}

function startGroupChat() {
    // Close new chat modal and open group chat modal
    const newChatModal = bootstrap.Modal.getInstance(document.getElementById('newChatModal'));
    const groupChatModal = new bootstrap.Modal(document.getElementById('groupChatModal'));
    
    if (newChatModal) newChatModal.hide();
    groupChatModal.show();
}

async function findUser() {
    const userIdInput = document.getElementById('userIdInput');
    const userPreview = document.getElementById('userPreview');
    const startChatBtn = document.getElementById('startChatBtn');
    
    const userId = userIdInput.value.trim();
    if (!userId) {
        MainJS.showError('Please enter a user ID');
        return;
    }
    
    try {
        const response = await MainJS.apiRequest('/api/find-user', {
            method: 'POST',
            body: JSON.stringify({ user_id: userId })
        });
        
        if (response.success && response.user) {
            userPreview.innerHTML = `
                <div class="d-flex align-items-center">
                    <div class="avatar bg-success me-3">
                        ${response.user.name[0].toUpperCase()}
                    </div>
                    <div>
                        <div class="fw-bold">${MainJS.escapeHtml(response.user.name)}</div>
                        <small class="text-muted">${MainJS.escapeHtml(response.user.email || 'No email')}</small>
                    </div>
                </div>
            `;
            userPreview.style.display = 'block';
            startChatBtn.style.display = 'block';
            window.foundUser = response.user;
        } else {
            MainJS.showError('User not found');
            userPreview.style.display = 'none';
            startChatBtn.style.display = 'none';
        }
    } catch (error) {
        console.error('Find user error:', error);
        MainJS.showError('Failed to find user');
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
});

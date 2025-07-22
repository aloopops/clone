import os
import mimetypes
from datetime import datetime
from flask import render_template, request, jsonify, session, redirect, url_for, send_file, send_from_directory
from werkzeug.utils import secure_filename
from sqlalchemy import or_, and_, desc
from sqlalchemy.orm import joinedload
from app import app, db
from models import User, Conversation, ConversationParticipant, Message, MessageSeen

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

def get_file_icon(file_type):
    """Return appropriate Font Awesome icon for file type"""
    if file_type.startswith('image/'):
        return 'fas fa-image'
    elif file_type.startswith('audio/'):
        return 'fas fa-music'
    elif file_type.startswith('video/'):
        return 'fas fa-video'
    elif 'pdf' in file_type:
        return 'fas fa-file-pdf'
    elif any(word in file_type for word in ['word', 'document']):
        return 'fas fa-file-word'
    elif any(word in file_type for word in ['excel', 'sheet']):
        return 'fas fa-file-excel'
    elif any(word in file_type for word in ['powerpoint', 'presentation']):
        return 'fas fa-file-powerpoint'
    elif 'zip' in file_type or 'archive' in file_type:
        return 'fas fa-file-archive'
    elif 'apk' in file_type:
        return 'fab fa-android'
    else:
        return 'fas fa-file'

def format_file_size(size_bytes):
    """Convert bytes to human readable format"""
    if size_bytes == 0:
        return "0B"
    size_names = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    while size_bytes >= 1024.0 and i < len(size_names) - 1:
        size_bytes /= 1024.0
        i += 1
    return f"{size_bytes:.1f}{size_names[i]}"

@app.route('/')
def landing():
    if 'user_id' in session:
        return redirect(url_for('chat'))
    return render_template('landing.html')

@app.route('/register')
def register():
    if 'user_id' in session:
        return redirect(url_for('chat'))
    return render_template('register.html')

@app.route('/chat')
def chat():
    if 'user_id' not in session:
        return redirect(url_for('landing'))
    
    user = User.query.get(session['user_id'])
    if not user:
        session.clear()
        return redirect(url_for('landing'))
    
    # Update user online status
    user.online = True
    user.last_seen = datetime.utcnow()
    db.session.commit()
    
    return render_template('chat.html', user=user)

@app.route('/settings')
def settings():
    if 'user_id' not in session:
        return redirect(url_for('landing'))
    
    user = User.query.get(session['user_id'])
    if not user:
        session.clear()
        return redirect(url_for('landing'))
    
    return render_template('settings.html', user=user)

@app.route('/logout')
def logout():
    if 'user_id' in session:
        user = User.query.get(session['user_id'])
        if user:
            user.online = False
            user.last_seen = datetime.utcnow()
            db.session.commit()
    
    session.clear()
    return redirect(url_for('landing'))

# API Routes

@app.route('/api/register', methods=['POST'])
def api_register():
    try:
        data = request.get_json()
        name = data.get('name', '').strip()
        email = data.get('email', '').strip().lower()
        
        if not name or not email:
            return jsonify({'success': False, 'message': 'Name and email are required'})
        
        # Check if email already exists
        if User.query.filter_by(email=email).first():
            return jsonify({'success': False, 'message': 'Email already registered'})
        
        # Create new user
        user = User(name=name, email=email)
        db.session.add(user)
        db.session.commit()
        
        session['user_id'] = user.user_id
        
        return jsonify({'success': True, 'message': 'Account created successfully'})
    
    except Exception as e:
        app.logger.error(f"Registration error: {e}")
        return jsonify({'success': False, 'message': 'Registration failed'})

@app.route('/api/conversations')
def api_conversations():
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'})
    
    user_id = session['user_id']
    
    try:
        # Get conversations where user is a participant
        conversations = db.session.query(Conversation).join(
            ConversationParticipant,
            Conversation.id == ConversationParticipant.conversation_id
        ).filter(
            ConversationParticipant.user_id == user_id
        ).all()
        
        result = []
        for conv in conversations:
            # Get other participants
            participants = db.session.query(User).join(
                ConversationParticipant,
                User.user_id == ConversationParticipant.user_id
            ).filter(
                ConversationParticipant.conversation_id == conv.id
            ).all()
            
            # Get last message
            last_message = None
            last_msg = Message.query.filter_by(conversation_id=conv.id).order_by(Message.timestamp.desc()).first()
            if last_msg:
                sender = User.query.get(last_msg.sender_id)
                last_message = {
                    'content': last_msg.content or (f"📎 {last_msg.file_name}" if last_msg.message_type == 'file' else 
                                                  "🎵 Voice message" if last_msg.message_type == 'audio' else 
                                                  "📷 Image" if last_msg.message_type == 'image' else last_msg.content),
                    'timestamp': last_msg.timestamp.isoformat(),
                    'sender_name': sender.name if sender else 'Unknown'
                }
            
            # For private chats, use the other participant's info
            if conv.type == 'private':
                other_participant = next((p for p in participants if p.user_id != user_id), None)
                if other_participant:
                    conv_name = other_participant.name
                    online = other_participant.online
                else:
                    conv_name = "Unknown User"
                    online = False
            else:
                conv_name = conv.name
                online = any(p.online for p in participants if p.user_id != user_id)
            
            result.append({
                'id': conv.id,
                'name': conv_name,
                'type': conv.type,
                'online': online,
                'participants': [{'id': p.user_id, 'name': p.name, 'online': p.online} for p in participants],
                'last_message': last_message
            })
        
        # Sort by last message timestamp
        result.sort(key=lambda x: x['last_message']['timestamp'] if x['last_message'] else '1970-01-01T00:00:00', reverse=True)
        
        return jsonify({'success': True, 'conversations': result})
    
    except Exception as e:
        app.logger.error(f"Error loading conversations: {e}")
        return jsonify({'success': False, 'message': 'Failed to load conversations'})

@app.route('/api/messages/<conversation_id>')
def api_messages(conversation_id):
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'})
    
    user_id = session['user_id']
    
    try:
        # Verify user is participant in this conversation
        participant = ConversationParticipant.query.filter_by(
            conversation_id=conversation_id,
            user_id=user_id
        ).first()
        
        if not participant:
            return jsonify({'success': False, 'message': 'Access denied'})
        
        # Get messages
        messages = Message.query.filter_by(
            conversation_id=conversation_id
        ).order_by(Message.timestamp).all()
        
        result = []
        for msg in messages:
            message_data = {
                'id': msg.id,
                'sender_id': msg.sender_id,
                'sender_name': (lambda user: user.name if user else 'Unknown')(User.query.get(msg.sender_id)),
                'content': msg.content,
                'message_type': msg.message_type,
                'timestamp': msg.timestamp.isoformat(),
                'seen_by': [seen.user_id for seen in MessageSeen.query.filter_by(message_id=msg.id).all()]
            }
            
            # Add file information if it's a file message
            if msg.message_type in ['file', 'audio', 'image']:
                message_data.update({
                    'file_name': msg.file_name,
                    'file_size': msg.file_size,
                    'file_type': msg.file_type,
                    'file_size_formatted': format_file_size(msg.file_size) if msg.file_size else '0B',
                    'file_icon': get_file_icon(msg.file_type or ''),
                    'audio_duration': msg.audio_duration
                })
            
            result.append(message_data)
        
        return jsonify({'success': True, 'messages': result})
    
    except Exception as e:
        app.logger.error(f"Error loading messages: {e}")
        return jsonify({'success': False, 'message': 'Failed to load messages'})

@app.route('/api/send_message', methods=['POST'])
def api_send_message():
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'})
    
    user_id = session['user_id']
    
    try:
        data = request.get_json()
        conversation_id = data.get('conversation_id')
        content = data.get('content', '').strip()
        
        if not conversation_id or not content:
            return jsonify({'success': False, 'message': 'Conversation ID and content are required'})
        
        # Verify user is participant
        participant = ConversationParticipant.query.filter_by(
            conversation_id=conversation_id,
            user_id=user_id
        ).first()
        
        if not participant:
            return jsonify({'success': False, 'message': 'Access denied'})
        
        # Create message
        message = Message(
            conversation_id=conversation_id,
            sender_id=user_id,
            content=content,
            message_type='text'
        )
        
        db.session.add(message)
        db.session.commit()
        
        # Get sender info
        sender = User.query.get(user_id)
        
        # Return complete message data for instant display
        message_data = {
            'id': message.id,
            'sender_id': message.sender_id,
            'sender_name': sender.name if sender else 'Unknown',
            'content': message.content,
            'message_type': message.message_type,
            'timestamp': message.timestamp.isoformat(),
            'seen_by': []  # Initially empty
        }
        
        return jsonify({'success': True, 'message': message_data})
    
    except Exception as e:
        app.logger.error(f"Error sending message: {e}")
        return jsonify({'success': False, 'message': 'Failed to send message'})


@app.route('/api/upload_file', methods=['POST'])
def api_upload_file():
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'})
    
    user_id = session['user_id']
    
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'message': 'No file uploaded'})
        
        file = request.files['file']
        conversation_id = request.form.get('conversation_id')
        
        if not conversation_id:
            return jsonify({'success': False, 'message': 'Conversation ID is required'})
        
        if file.filename == '':
            return jsonify({'success': False, 'message': 'No file selected'})
        
        # Verify user is participant
        participant = ConversationParticipant.query.filter_by(
            conversation_id=conversation_id,
            user_id=user_id
        ).first()
        
        if not participant:
            return jsonify({'success': False, 'message': 'Access denied'})
        
        if file and file.filename and allowed_file(file.filename):
            filename = secure_filename(file.filename) or 'unnamed_file'
            
            # Create unique filename to avoid conflicts
            base_name, ext = os.path.splitext(filename)
            unique_filename = f"{base_name}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}{ext}"
            
            file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
            file.save(file_path)
            
            # Get file info
            file_size = os.path.getsize(file_path)
            file_type = mimetypes.guess_type(filename)[0] or 'application/octet-stream'
            
            # Determine message type based on file type
            message_type = 'file'
            if file_type.startswith('image/'):
                message_type = 'image'
            elif file_type.startswith('audio/'):
                message_type = 'audio'
            
            # Create message
            message = Message(
                conversation_id=conversation_id,
                sender_id=user_id,
                content=f"📎 {filename}",
                message_type=message_type,
                file_path=unique_filename,
                file_name=filename,
                file_size=file_size,
                file_type=file_type
            )
            
            db.session.add(message)
            db.session.commit()
            
            return jsonify({'success': True, 'message': 'File uploaded successfully'})
        else:
            return jsonify({'success': False, 'message': 'File type not allowed'})
    
    except Exception as e:
        app.logger.error(f"Error uploading file: {e}")
        return jsonify({'success': False, 'message': 'Failed to upload file'})

@app.route('/api/upload_audio', methods=['POST'])
def api_upload_audio():
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'})
    
    user_id = session['user_id']
    
    try:
        if 'audio' not in request.files:
            return jsonify({'success': False, 'message': 'No audio file uploaded'})
        
        audio_file = request.files['audio']
        conversation_id = request.form.get('conversation_id')
        duration = float(request.form.get('duration', 0))
        
        if not conversation_id:
            return jsonify({'success': False, 'message': 'Conversation ID is required'})
        
        # Verify user is participant
        participant = ConversationParticipant.query.filter_by(
            conversation_id=conversation_id,
            user_id=user_id
        ).first()
        
        if not participant:
            return jsonify({'success': False, 'message': 'Access denied'})
        
        # Create unique filename
        filename = f"voice_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.webm"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        audio_file.save(file_path)
        
        # Get file info
        file_size = os.path.getsize(file_path)
        
        # Create message
        message = Message(
            conversation_id=conversation_id,
            sender_id=user_id,
            content="🎵 Voice message",
            message_type='audio',
            file_path=filename,
            file_name="Voice message",
            file_size=file_size,
            file_type='audio/webm',
            audio_duration=duration
        )
        
        db.session.add(message)
        db.session.commit()
        
        return jsonify({'success': True, 'message': 'Voice message sent'})
    
    except Exception as e:
        app.logger.error(f"Error uploading audio: {e}")
        return jsonify({'success': False, 'message': 'Failed to send voice message'})

@app.route('/api/download/<message_id>')
def api_download(message_id):
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401
    
    user_id = session['user_id']
    
    try:
        # Get message
        message = Message.query.get(message_id)
        if not message or not message.file_path:
            return jsonify({'success': False, 'message': 'File not found'}), 404
        
        # Verify user has access to this conversation
        participant = ConversationParticipant.query.filter_by(
            conversation_id=message.conversation_id,
            user_id=user_id
        ).first()
        
        if not participant:
            return jsonify({'success': False, 'message': 'Access denied'}), 403
        
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], message.file_path)
        
        if not os.path.exists(file_path):
            return jsonify({'success': False, 'message': 'File not found on server'}), 404
        
        return send_file(
            file_path,
            as_attachment=True,
            download_name=message.file_name,
            mimetype=message.file_type
        )
    
    except Exception as e:
        app.logger.error(f"Error downloading file: {e}")
        return jsonify({'success': False, 'message': 'Download failed'}), 500

@app.route('/api/find_user', methods=['POST'])
def api_find_user():
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'})
    
    try:
        data = request.get_json()
        unique_id = data.get('unique_id', '').strip().upper()
        
        if not unique_id:
            return jsonify({'success': False, 'message': 'User ID is required'})
        
        user = User.query.filter_by(unique_id=unique_id).first()
        if not user:
            return jsonify({'success': False, 'message': 'User not found'})
        
        if user.user_id == session['user_id']:
            return jsonify({'success': False, 'message': 'Cannot start chat with yourself'})
        
        return jsonify({
            'success': True,
            'user': {
                'user_id': user.user_id,
                'name': user.name,
                'unique_id': user.unique_id,
                'online': user.online
            }
        })
    
    except Exception as e:
        app.logger.error(f"Error finding user: {e}")
        return jsonify({'success': False, 'message': 'Search failed'})

@app.route('/api/start_private_chat', methods=['POST'])
def api_start_private_chat():
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'})
    
    user_id = session['user_id']
    
    try:
        data = request.get_json()
        other_user_id = data.get('user_id')
        
        if not other_user_id:
            return jsonify({'success': False, 'message': 'User ID is required'})
        
        if other_user_id == user_id:
            return jsonify({'success': False, 'message': 'Cannot start chat with yourself'})
        
        # Check if conversation already exists
        existing_conv = db.session.query(Conversation).join(
            ConversationParticipant, Conversation.id == ConversationParticipant.conversation_id
        ).filter(
            Conversation.type == 'private',
            ConversationParticipant.user_id.in_([user_id, other_user_id])
        ).group_by(Conversation.id).having(
            db.func.count(ConversationParticipant.user_id) == 2
        ).first()
        
        if existing_conv:
            # Check if both users are participants
            participants = ConversationParticipant.query.filter_by(conversation_id=existing_conv.id).all()
            participant_ids = [p.user_id for p in participants]
            if set(participant_ids) == {user_id, other_user_id}:
                return jsonify({'success': True, 'conversation_id': existing_conv.id})
        
        # Create new conversation
        other_user = User.query.get(other_user_id)
        if not other_user:
            return jsonify({'success': False, 'message': 'User not found'})
        
        conversation = Conversation(
            name=f"Private chat with {other_user.name}",
            type='private',
            created_by=user_id
        )
        
        db.session.add(conversation)
        db.session.flush()  # Get the ID
        
        # Add participants
        participant1 = ConversationParticipant(conversation_id=conversation.id, user_id=user_id)
        participant2 = ConversationParticipant(conversation_id=conversation.id, user_id=other_user_id)
        
        db.session.add(participant1)
        db.session.add(participant2)
        db.session.commit()
        
        return jsonify({'success': True, 'conversation_id': conversation.id})
    
    except Exception as e:
        app.logger.error(f"Error starting private chat: {e}")
        return jsonify({'success': False, 'message': 'Failed to start chat'})

@app.route('/api/create_group', methods=['POST'])
def api_create_group():
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'})
    
    user_id = session['user_id']
    
    try:
        data = request.get_json()
        group_name = data.get('name', '').strip()
        member_ids = data.get('members', [])
        
        if not group_name:
            return jsonify({'success': False, 'message': 'Group name is required'})
        
        if len(member_ids) < 1 or len(member_ids) > 9:
            return jsonify({'success': False, 'message': 'Group must have 2-10 members (including you)'})
        
        # Verify all members exist
        members = User.query.filter(User.unique_id.in_(member_ids)).all()
        if len(members) != len(member_ids):
            return jsonify({'success': False, 'message': 'Some members not found'})
        
        # Create conversation
        conversation = Conversation(
            name=group_name,
            type='group',
            created_by=user_id
        )
        
        db.session.add(conversation)
        db.session.flush()  # Get the ID
        
        # Add creator as participant
        creator_participant = ConversationParticipant(conversation_id=conversation.id, user_id=user_id)
        db.session.add(creator_participant)
        
        # Add other participants
        for member in members:
            if member.user_id != user_id:  # Don't add creator twice
                participant = ConversationParticipant(conversation_id=conversation.id, user_id=member.user_id)
                db.session.add(participant)
        
        db.session.commit()
        
        return jsonify({'success': True, 'conversation_id': conversation.id})
    
    except Exception as e:
        app.logger.error(f"Error creating group: {e}")
        return jsonify({'success': False, 'message': 'Failed to create group'})

@app.route('/api/update_status', methods=['POST'])
def api_update_status():
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'})
    
    try:
        user = User.query.get(session['user_id'])
        if user:
            data = request.get_json()
            user.online = data.get('online', True)
            user.last_seen = datetime.utcnow()
            db.session.commit()
        
        return jsonify({'success': True})
    
    except Exception as e:
        app.logger.error(f"Error updating status: {e}")
        return jsonify({'success': False, 'message': 'Failed to update status'})

# Double Blue Tick System - Mark messages as seen
@app.route('/api/mark_seen', methods=['POST'])
def api_mark_seen():
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'})
    
    user_id = session['user_id']
    
    try:
        data = request.get_json()
        message_ids = data.get('message_ids', [])
        
        if not message_ids:
            return jsonify({'success': False, 'message': 'Message IDs required'})
        
        # Mark messages as seen for this user
        for message_id in message_ids:
            # Check if already seen
            existing_seen = MessageSeen.query.filter_by(
                message_id=message_id,
                user_id=user_id
            ).first()
            
            if not existing_seen:
                message_seen = MessageSeen(
                    message_id=message_id,
                    user_id=user_id
                )
                db.session.add(message_seen)
        
        db.session.commit()
        return jsonify({'success': True})
    
    except Exception as e:
        app.logger.error(f"Error marking messages as seen: {e}")
        return jsonify({'success': False, 'message': 'Failed to mark messages as seen'})

# Get message seen status for double blue tick display
@app.route('/api/message_status/<message_id>')
def api_message_status(message_id):
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'})
    
    try:
        # Get message
        message = Message.query.get(message_id)
        if not message:
            return jsonify({'success': False, 'message': 'Message not found'})
        
        # Check if user has access to this conversation
        participant = ConversationParticipant.query.filter_by(
            conversation_id=message.conversation_id,
            user_id=session['user_id']
        ).first()
        
        if not participant:
            return jsonify({'success': False, 'message': 'Access denied'})
        
        # Get all participants in the conversation except sender
        conversation_participants = ConversationParticipant.query.filter(
            ConversationParticipant.conversation_id == message.conversation_id,
            ConversationParticipant.user_id != message.sender_id
        ).all()
        
        # Count how many have seen the message
        seen_count = MessageSeen.query.filter_by(message_id=message_id).count()
        total_recipients = len(conversation_participants)
        
        # Determine status: sent (1 tick), delivered (2 gray ticks), seen (2 blue ticks)
        if seen_count == 0:
            status = 'delivered'  # 2 gray ticks
        elif seen_count == total_recipients:
            status = 'seen'  # 2 blue ticks
        else:
            status = 'partially_seen'  # 2 blue ticks
        
        return jsonify({
            'success': True,
            'status': status,
            'seen_count': seen_count,
            'total_recipients': total_recipients
        })
    
    except Exception as e:
        app.logger.error(f"Error getting message status: {e}")
        return jsonify({'success': False, 'message': 'Failed to get message status'})

# Image preview endpoint for WhatsApp-like image viewing
@app.route('/api/image/<message_id>')
def api_view_image(message_id):
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401
    
    user_id = session['user_id']
    
    try:
        # Get message
        message = Message.query.get(message_id)
        if not message or message.message_type != 'image':
            return jsonify({'success': False, 'message': 'Image not found'}), 404
        
        # Verify user has access to this conversation
        participant = ConversationParticipant.query.filter_by(
            conversation_id=message.conversation_id,
            user_id=user_id
        ).first()
        
        if not participant:
            return jsonify({'success': False, 'message': 'Access denied'}), 403
        
        # Return image file
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], message.file_path)
        if os.path.exists(file_path):
            return send_file(file_path)
        else:
            return jsonify({'success': False, 'message': 'File not found on server'}), 404
    
    except Exception as e:
        app.logger.error(f"Error viewing image: {e}")
        return jsonify({'success': False, 'message': 'Failed to load image'}), 500

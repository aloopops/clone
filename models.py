from datetime import datetime
from app import db
import uuid
import secrets
import string

class User(db.Model):
    __tablename__ = 'users'
    
    user_id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    unique_id = db.Column(db.String(8), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    online = db.Column(db.Boolean, default=False)
    last_seen = db.Column(db.DateTime, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __init__(self, **kwargs):
        super(User, self).__init__(**kwargs)
        if not self.unique_id:
            self.unique_id = self.generate_unique_id()
    
    @staticmethod
    def generate_unique_id():
        """Generate a unique 8-character ID"""
        while True:
            unique_id = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(8))
            if not User.query.filter_by(unique_id=unique_id).first():
                return unique_id

class Conversation(db.Model):
    __tablename__ = 'conversations'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(200), nullable=False)
    type = db.Column(db.String(20), nullable=False, default='private')  # 'private' or 'group'
    created_by = db.Column(db.String(36), db.ForeignKey('users.user_id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __init__(self, **kwargs):
        super(Conversation, self).__init__(**kwargs)

class ConversationParticipant(db.Model):
    __tablename__ = 'conversation_participants'
    
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.String(36), db.ForeignKey('conversations.id'), nullable=False)
    user_id = db.Column(db.String(36), db.ForeignKey('users.user_id'), nullable=False)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __init__(self, **kwargs):
        super(ConversationParticipant, self).__init__(**kwargs)

class Message(db.Model):
    __tablename__ = 'messages'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    conversation_id = db.Column(db.String(36), db.ForeignKey('conversations.id'), nullable=False)
    sender_id = db.Column(db.String(36), db.ForeignKey('users.user_id'), nullable=False)
    content = db.Column(db.Text)
    message_type = db.Column(db.String(20), default='text')  # 'text', 'file', 'audio', 'image'
    file_path = db.Column(db.String(500))
    file_name = db.Column(db.String(255))
    file_size = db.Column(db.Integer)
    file_type = db.Column(db.String(100))
    audio_duration = db.Column(db.Float)  # Duration in seconds for audio files
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    sender = db.relationship('User', backref='sent_messages')
    conversation = db.relationship('Conversation', backref='messages')
    
    def __init__(self, **kwargs):
        super(Message, self).__init__(**kwargs)

class MessageSeen(db.Model):
    __tablename__ = 'message_seen'
    
    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.String(36), db.ForeignKey('messages.id'), nullable=False)
    user_id = db.Column(db.String(36), db.ForeignKey('users.user_id'), nullable=False)
    seen_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __init__(self, **kwargs):
        super(MessageSeen, self).__init__(**kwargs)

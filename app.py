import os
import logging
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase
from werkzeug.middleware.proxy_fix import ProxyFix

# Configure logging
logging.basicConfig(level=logging.DEBUG)

class Base(DeclarativeBase):
    pass

# Initialize database
db = SQLAlchemy(model_class=Base)

# Create Flask app
app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "dev-secret-key")
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

# Configure database
app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL", "sqlite:///whatsapp_clone.db")
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_recycle": 300,
    "pool_pre_ping": True,
}

# File upload configuration
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max file size
app.config['UPLOAD_FOLDER'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
app.config['ALLOWED_EXTENSIONS'] = {
    'txt', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'psd', 'ai', 'eps',
    'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'wma',
    'mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', '3gp', 'webm',
    'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp',
    'zip', 'rar', '7z', 'tar', 'gz', 'bz2',
    'apk', 'exe', 'dmg', 'deb', 'rpm', 'msi',
    'html', 'css', 'js', 'json', 'xml', 'csv',
    'rtf', 'tex', 'md', 'log'
}

# Initialize database with app
db.init_app(app)

# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Create tables
with app.app_context():
    import models  # noqa: F401
    db.create_all()
    logging.info("Database tables created")

# Import routes
import routes  # noqa: F401

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)

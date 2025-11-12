#!/bin/bash
set -e
echo "=========================================="
echo "Setting up Python backend for Journeyman"
echo "=========================================="
cd /workspaces/Journeyman/journeyman
echo "Creating directory structure..."
mkdir -p backend-python/{config,utils,models,api}
cd backend-python
echo "Creating Python package files..."
touch config/__init__.py utils/__init__.py models/__init__.py api/__init__.py
echo "Creating requirements.txt..."
cat > requirements.txt << 'EOFR'
cryptography>=41.0.0
python-dotenv>=1.0.0
flask>=3.0.0
flask-cors>=4.0.0
psycopg2-binary>=2.9.0
redis>=5.0.0
APScheduler>=3.10.0
EOFR
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is not installed. Installing..."
    sudo apt update && sudo apt install -y python3 python3-pip python3-venv
fi
echo "Creating virtual environment..."
python3 -m venv venv
echo "Activating virtual environment..."
source venv/bin/activate
echo "Upgrading pip..."
pip install --upgrade pip
echo "Installing Python dependencies..."
pip install -r requirements.txt
echo ""
echo "=========================================="
echo "✓ Python backend setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. cd /workspaces/Journeyman/journeyman/backend-python"
echo "  2. source venv/bin/activate"
echo "  3. Generate encryption key:"
echo "     python3 -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'"
echo "  4. Create .env file with the generated key"
echo "  5. Run: python3 app.py"
echo ""

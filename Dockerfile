FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    git && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -ms /bin/bash myuser

COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

# 👇 Fix upload folder permission before switching user
RUN mkdir -p /app/uploads && \
    chown -R myuser:myuser /app/uploads

RUN mkdir -p /app/instance && \
    chown -R myuser:myuser /app/instance


USER myuser

EXPOSE 7860

CMD ["python", "main.py"]
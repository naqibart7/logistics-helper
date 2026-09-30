FROM python:3.12-slim

WORKDIR /app

# Dependencies first (layer-cached)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Source (data/ is excluded by .dockerignore and provided by the bind mount)
COPY . .

CMD ["python", "-m", "bot.main"]
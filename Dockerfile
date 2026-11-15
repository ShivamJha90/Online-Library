FROM python:3.12-slim

WORKDIR /app
COPY . .

ENV SCHOLARSCROLL_HOST=0.0.0.0 \
    SCHOLARSCROLL_PORT=8000 \
    SCHOLARSCROLL_DATA_DIR=/data

# Mount a persistent volume here so accounts, purchases and vouchers survive
# redeploys. Without one, SQLite resets with the container filesystem.
VOLUME ["/data"]
EXPOSE 8000

CMD ["python", "server/app.py"]

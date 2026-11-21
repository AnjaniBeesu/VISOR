FROM colmap/colmap:latest

ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-venv python3-pip ffmpeg libgl1 libglib2.0-0 libgomp1 \
    libsm6 libxext6 libxrender1 \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/visor-venv
ENV PATH="/opt/visor-venv/bin:$PATH"
WORKDIR /app
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt
COPY app ./app
RUN mkdir -p /data/jobs
ENV VISOR_DATA_DIR=/data/jobs
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

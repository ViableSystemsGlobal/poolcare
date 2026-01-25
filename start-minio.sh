#!/bin/bash

# Start MinIO for PoolCare development
# This script starts a MinIO container for local file storage

echo "Starting MinIO for PoolCare..."

# Check if MinIO container already exists
if docker ps -a | grep -q "poolcare-minio"; then
    echo "MinIO container exists. Starting it..."
    docker start poolcare-minio
else
    echo "Creating new MinIO container..."
    docker run -d \
        --name poolcare-minio \
        -p 9000:9000 \
        -p 9001:9001 \
        -e "MINIO_ROOT_USER=minioadmin" \
        -e "MINIO_ROOT_PASSWORD=minioadmin" \
        -v poolcare-minio-data:/data \
        minio/minio server /data --console-address ":9001"
fi

echo ""
echo "✅ MinIO is starting..."
echo ""
echo "MinIO API: http://localhost:9000"
echo "MinIO Console: http://localhost:9001"
echo "Access Key: minioadmin"
echo "Secret Key: minioadmin"
echo ""
echo "The bucket 'poolcare' will be created automatically on first use."
echo ""
echo "To stop MinIO: docker stop poolcare-minio"
echo "To remove MinIO: docker stop poolcare-minio && docker rm poolcare-minio"


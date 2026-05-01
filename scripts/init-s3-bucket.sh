#!/usr/bin/env bash
set -e
docker run --rm --network host \
  -e AWS_ACCESS_KEY_ID=minio \
  -e AWS_SECRET_ACCESS_KEY=minio12345 \
  amazon/aws-cli s3api create-bucket --bucket bom-studio-dev --endpoint-url http://localhost:9000 || true
echo "bucket bom-studio-dev ready"

# ---------------------------------------------------------------------------
# OmniLog Official Server - multi-stage Docker build
# ---------------------------------------------------------------------------
FROM rust:1.82-bookworm AS builder

WORKDIR /build
COPY apps/server/ ./

RUN cargo build --release && \
    strip target/release/omnilog-server

# ---------------------------------------------------------------------------
FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

RUN useradd -r -m -s /usr/sbin/nologin omnilog

COPY --from=builder /build/target/release/omnilog-server /usr/local/bin/omnilog-server

RUN mkdir -p /data && chown omnilog:omnilog /data

USER omnilog
WORKDIR /data

ENV DATA_DIR=/data \
    PORT=3000 \
    HOST=0.0.0.0

EXPOSE 3000
VOLUME ["/data"]

ENTRYPOINT ["omnilog-server"]

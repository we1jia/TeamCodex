# --------------------------------------------------
# TeamCodex Hub - Lightweight Production Container
# --------------------------------------------------
FROM node:20-alpine

LABEL maintainer="we1jia"
LABEL description="TeamCodex Hub Service for Codex Desktop Collaboration"

WORKDIR /app

# 复制服务核心与 UI 资源
COPY server/ ./server/
COPY inject/ ./inject/
COPY ui/ ./ui/
COPY data/ ./data/

# 创建持久化数据目录
RUN mkdir -p /app/data

# 默认环境变量
ENV NODE_ENV=production
ENV TEAM_CONTEXT_BIND_HOST=0.0.0.0
ENV TEAM_CONTEXT_PORT=18765
ENV TEAM_CONTEXT_DATA_DIR=/app/data

# 暴露服务端口
EXPOSE 18765

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:18765/api/health || exit 1

# 启动服务
CMD ["node", "server/dev_host.mjs"]

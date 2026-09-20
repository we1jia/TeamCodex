#!/bin/bash
set -euo pipefail

HOST="127.0.0.1"
PORT="${TEAM_CONTEXT_PORT:-18765}"
URL="http://${HOST}:${PORT}/"

script_dir="$(cd "$(dirname "$0")" && pwd)"
if [[ -d "$script_dir/TeamContext.app" ]]; then
  root="$(cd "$script_dir/.." && pwd)"
elif [[ "$(basename "$script_dir")" == "MacOS" ]]; then
  root="$(cd "$script_dir/../../../.." && pwd)"
else
  root="$(cd "$script_dir/.." && pwd)"
fi

data_dir="${TEAM_CONTEXT_DATA_DIR:-}"
if [[ -z "$data_dir" && -f "$root/data-directory.txt" ]]; then
  IFS= read -r data_dir < "$root/data-directory.txt"
fi
data_dir="${data_dir:-$root/data}"
[[ "$data_dir" == /* ]] || { echo "TeamCodex 数据目录必须是绝对路径" >&2; exit 1; }
export TEAM_CONTEXT_DATA_DIR="$data_dir"
log_file="$data_dir/launcher.log"
mkdir -p "$data_dir"

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/v22.21.1/bin:$PATH"
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
fi

find_node() {
  if command -v node >/dev/null 2>&1; then
    command -v node
    return
  fi
  local candidate
  for candidate in \
    "$HOME/.nvm/versions/node/v22.21.1/bin/node" \
    /opt/homebrew/bin/node \
    /usr/local/bin/node
  do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return
    fi
  done
  ls -d "$HOME"/.nvm/versions/node/*/bin/node 2>/dev/null | tail -n 1
}

notify() {
  /usr/bin/osascript -e "display notification \"$1\" with title \"TeamCodex\"" >/dev/null 2>&1 || true
}

fail() {
  notify "$1"
  /usr/bin/osascript -e "display dialog \"$1\" buttons {\"好\"} default button 1 with title \"TeamCodex\"" >/dev/null 2>&1 || true
  echo "$1" >>"$log_file"
  exit 1
}

health() {
  curl --noproxy '*' -fsS --max-time 2 "${URL}api/health" 2>/dev/null || true
}

node_bin="$(find_node || true)"
[[ -x "${node_bin:-}" ]] || fail "找不到 Node.js。"
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy NO_PROXY

{
  echo "$(date '+%Y-%m-%d %H:%M:%S') start root=$root url=$URL"
  current="$(health)"
  if [[ "$current" == *'"isolated":true'* || "$current" == *'"team-context-hub"'* ]]; then
    echo "reuse existing isolated host"
  else
    if [[ -n "$current" ]]; then
      fail "端口 ${PORT} 已被其他服务占用，拒绝启动，以免影响现有代理。"
    fi
    nohup "$node_bin" "$root/server/dev_host.mjs" >>"$log_file" 2>&1 &
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      current="$(health)"
      [[ "$current" == *'"isolated":true'* || "$current" == *'"team-context-hub"'* ]] && break
      sleep 0.2
    done
    [[ "$current" == *'"isolated":true'* || "$current" == *'"team-context-hub"'* ]] || fail "协作服务启动失败，详见 data/launcher.log"
  fi
  notify "正在把「TeamCodex」加到 Codex 左栏，不改 Cockpit 代理。"
} >>"$log_file" 2>&1

LAUNCHER_PORT="${TEAM_CODEX_LAUNCHER_PORT:-18767}"
if ! curl --noproxy '*' -fsS --max-time 2 "http://127.0.0.1:${LAUNCHER_PORT}/panel.html" >/dev/null 2>&1; then
  nohup "$node_bin" "$root/server/launcher_host.mjs" >>"$log_file" 2>&1 &
fi

# 启动器负责唯一的本目录注入器；引导脚本不杀 Codex、其他安装实例或系统监听器。
echo "$(date '+%Y-%m-%d %H:%M:%S') TeamCodex launcher ready; waiting for current Codex" >>"$log_file"

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends git nodejs npm && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 10001 agent
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY runner ./runner
USER agent
ENV AGENT_RUNNER_STATE_DIR=/home/agent/.agent-runner APPROVED_WORKSPACE_ROOTS=/workspace
# Mount ONLY the approved workspace: -v ~/AI-Projects:/workspace
CMD ["python", "-m", "runner", "start"]

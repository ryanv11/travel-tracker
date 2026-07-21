#!/bin/bash
# Travel Tracker — Agent diagnostic read-only Railway query (ADL-33 / ADL-34 / OP-21)
#
# Railway's official CLI (@railway/cli) has no Linux aarch64 build, which is what
# this sandbox runs on — `npm i -g @railway/cli` fails at the postinstall binary
# download step. This script is the documented fallback: direct GraphQL calls
# against backboard.railway.com, using the Project-Access-Token header (NOT
# Authorization: Bearer — that's for account/workspace/OAuth tokens only).
#
# The Railway tokens themselves are technically write-capable (ADL-33 §3 — no
# read-only token scope exists on Railway). This script only ever issues GraphQL
# *queries*, never mutations — that is the enforcement boundary here, same as the
# read-only convention documented in the runbook. Treat the tokens as privileged.
#
# Usage:
#   scripts/agent-diagnostics/railway-query.sh <prod|staging> status
#   scripts/agent-diagnostics/railway-query.sh <prod|staging> deployment <deployment-id>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../../.env.agent-diagnostics"

if [ ! -f "$ENV_FILE" ]; then
    echo "[DIAG] $ENV_FILE not found. See jobs/architect/tech/20260721-agent-diagnostics-runbook.md." >&2
    exit 1
fi
# shellcheck source=/dev/null
source "$ENV_FILE"

TARGET="${1:-}"
COMMAND="${2:-}"

if [ "$TARGET" != "prod" ] && [ "$TARGET" != "staging" ]; then
    echo "Usage: $0 <prod|staging> <status|deployment> [deployment-id]" >&2
    exit 1
fi

if [ "$TARGET" = "prod" ]; then
    TOKEN="$RAILWAY_PROD_TOKEN"
else
    TOKEN="$RAILWAY_STAGING_TOKEN"
fi

if [ -z "${TOKEN:-}" ]; then
    echo "[DIAG] RAILWAY_${TARGET^^}_TOKEN is not set in $ENV_FILE" >&2
    exit 1
fi

gql() {
    curl -s --request POST \
        --url https://backboard.railway.com/graphql/v2 \
        --header "Project-Access-Token: $TOKEN" \
        --header 'Content-Type: application/json' \
        --data "$1"
}

# Resolve projectId/environmentId from the token itself — never hardcoded, so
# this keeps working if the project is ever recreated.
ids=$(gql '{"query":"query { projectToken { projectId environmentId } }"}')
PROJECT_ID=$(echo "$ids" | jq -r '.data.projectToken.projectId')
ENVIRONMENT_ID=$(echo "$ids" | jq -r '.data.projectToken.environmentId')

if [ "$PROJECT_ID" = "null" ] || [ -z "$PROJECT_ID" ]; then
    echo "[DIAG] Token did not resolve to a project — check it hasn't been revoked. Raw response:" >&2
    echo "$ids" >&2
    exit 1
fi

case "$COMMAND" in
    status)
        gql "$(printf '{"query":"query { deployments(input: {projectId: \\"%s\\", environmentId: \\"%s\\"}, first: 5) { edges { node { id status createdAt } } } }"}' "$PROJECT_ID" "$ENVIRONMENT_ID")" \
            | jq '.data.deployments.edges[].node'
        ;;
    deployment)
        DEPLOYMENT_ID="${3:-}"
        if [ -z "$DEPLOYMENT_ID" ]; then
            echo "Usage: $0 <prod|staging> deployment <deployment-id>" >&2
            exit 1
        fi
        gql "$(printf '{"query":"query { deployment(id: \\"%s\\") { id status statusUpdatedAt canRedeploy meta } }"}' "$DEPLOYMENT_ID")" \
            | jq '.data.deployment'
        ;;
    *)
        echo "Usage: $0 <prod|staging> <status|deployment> [deployment-id]" >&2
        echo "  status                    -- 5 most recent deployments for this environment" >&2
        echo "  deployment <id>           -- full detail (status, meta, commit) for one deployment" >&2
        exit 1
        ;;
esac

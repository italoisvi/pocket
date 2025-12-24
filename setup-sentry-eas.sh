#!/bin/bash

# Script para adicionar variáveis do Sentry no EAS
# Execute este script para configurar o Sentry no EAS Build

echo "Adicionando variáveis do Sentry no EAS..."

# SENTRY_DSN
eas env:create \
  --name SENTRY_DSN \
  --value "https://e6f7d6a9cc641962923f429570ad6466@o4510586354925568.ingest.us.sentry.io/4510589471293440" \
  --scope project \
  --visibility plaintext

# SENTRY_ORG
eas env:create \
  --name SENTRY_ORG \
  --value "gladius-gs" \
  --scope project \
  --visibility plaintext

# SENTRY_PROJECT
eas env:create \
  --name SENTRY_PROJECT \
  --value "react-native" \
  --scope project \
  --visibility plaintext

# SENTRY_DISABLE_AUTO_UPLOAD
eas env:create \
  --name SENTRY_DISABLE_AUTO_UPLOAD \
  --value "true" \
  --scope project \
  --visibility plaintext

echo "Variáveis do Sentry configuradas com sucesso!"
echo ""
echo "Execute 'eas build --platform ios --profile production' para fazer o build"

# Fix 1: Remove círculo do botão de editar no perfil
$perfilPath = "app\perfil.tsx"
$perfilContent = Get-Content $perfilPath -Raw
$perfilContent = $perfilContent -replace '(\s+style=\[\s+styles\.editButton,\s+\{\s+backgroundColor: theme\.background,\s+borderColor: theme\.cardBorder,\s+\},\s+\])', '
                style={styles.editButton}'
$perfilContent = $perfilContent -replace '(editButton: \{\s+width: 44,\s+height: 44,\s+borderRadius: 22,\s+justifyContent: .center.,\s+alignItems: .center.,\s+borderWidth: 2,\s+\},)', 'editButton: {
    width: 44,
    height: 44,
    justifyContent: '"'"'center'"'"',
    alignItems: '"'"'center'"'"',
  },'
[System.IO.File]::WriteAllText($perfilPath, $perfilContent)

# Fix 2: Corrigir detecção de cartão Inter para Mastercard
$cardBrandPath = "lib\cardBrand.tsx"
$cardBrandContent = Get-Content $cardBrandPath -Raw
# Remover 'gold' e 'grafite' de Elo (linhas 33-34)
$cardBrandContent = $cardBrandContent -replace '(if \(\s+nameLower\.includes\(.elo.\) \|\|\s+nameLower\.includes\(.gold.\) \|\|\s+nameLower\.includes\(.grafite.\)\s+\)\s+return .elo.;)', 'if (nameLower.includes('"'"'elo'"'"')) return '"'"'elo'"'"';'
[System.IO.File]::WriteAllText($cardBrandPath, $cardBrandContent)

Write-Host "Fixes applied successfully!"

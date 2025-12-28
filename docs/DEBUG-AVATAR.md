# Debug - Avatar não aparecendo

## ⚠️ IMPORTANTE: Problema resolvido com o Splash Screen

O erro do `react-native-reanimated` foi corrigido! Agora o splash screen usa a API nativa do React Native (Animated) ao invés de bibliotecas externas.

## Logs adicionados

Adicionei logs detalhados para debugar o problema da foto de perfil. Os logs vão aparecer no console quando você:

1. **Editar perfil e fazer upload de foto:**
   - `[EditProfile] Starting upload for URI: ...`
   - `[EditProfile] Blob created, size: ...`
   - `[EditProfile] Uploading to path: ...`
   - `[EditProfile] Upload error: ...` (se houver erro)
   - `[EditProfile] Upload successful, getting public URL`
   - `[EditProfile] Public URL: ...`
   - `[EditProfile] Saving profile with avatar_url: ...`
   - `[EditProfile] Profile saved successfully: ...`

2. **Visualizar perfil (tela Perfil):**
   - `[Perfil] Profile data: ...`
   - `[Perfil] Profile error: ...`
   - `[Perfil] Setting profile image: ...` (se houver avatar)
   - `[Perfil] No avatar_url found in profile` (se não houver)

3. **Visualizar home:**
   - `[Home] Avatar URL from database: ...`
   - `[Home] Setting profile image: ...` (se houver avatar)
   - `[Home] No avatar_url found` (se não houver)

## O que verificar

1. **Executou as migrações no Supabase?**
   - Verifique se a coluna `avatar_url` existe na tabela `profiles`
   - Verifique se o bucket `profile-images` existe
   - Verifique se as políticas de storage estão configuradas

2. **Teste o upload:**
   - Vá em Editar Perfil
   - Escolha uma foto
   - Clique em Salvar
   - Copie os logs completos que aparecerem

3. **Verifique no Supabase:**
   - Vá em Table Editor → profiles
   - Verifique se a coluna `avatar_url` tem um valor para seu usuário
   - Se tiver, copie o URL

4. **Verifique no Storage:**
   - Vá em Storage → profile-images
   - Veja se tem alguma pasta com o ID do seu usuário
   - Veja se tem alguma imagem dentro

## Possíveis problemas

1. **Bucket não existe:** Execute a migração 3 do MIGRATION-INSTRUCTIONS.md
2. **Coluna avatar_url não existe:** Execute a migração 1 do MIGRATION-INSTRUCTIONS.md
3. **Erro de permissão ao fazer upload:** Verifique as políticas de RLS no bucket
4. **URL da imagem está correto mas não carrega:** Pode ser problema de CORS ou permissões públicas do bucket
5. **Upload funciona mas não salva no banco:** Verifique os logs do upsert

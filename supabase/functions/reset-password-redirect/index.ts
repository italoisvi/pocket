// Edge Function para redirecionar para o app Pocket
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pocket - Redefinir Senha</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: Georgia, 'Times New Roman', serif;
            background-color: #ffffff;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 500px;
            width: 100%;
            text-align: center;
        }

        h1 {
            font-size: 56px;
            font-weight: 700;
            color: #1a1a1a;
            margin-bottom: 16px;
        }

        h2 {
            font-size: 28px;
            font-weight: 600;
            color: #1a1a1a;
            margin-bottom: 24px;
        }

        p {
            font-size: 18px;
            color: #4a4a4a;
            line-height: 1.6;
            margin-bottom: 32px;
        }

        .button {
            display: inline-block;
            background-color: #1a1a1a;
            color: #ffffff;
            text-decoration: none;
            padding: 16px 48px;
            border-radius: 12px;
            font-size: 20px;
            font-weight: 600;
            cursor: pointer;
            border: 2px solid #1a1a1a;
            transition: all 0.2s;
        }

        .button:hover {
            background-color: #333333;
            border-color: #333333;
        }

        .info {
            margin-top: 32px;
            padding: 24px;
            background-color: #f9f9f9;
            border-radius: 12px;
            border: 2px solid #e5e5e5;
        }

        .info p {
            font-size: 16px;
            color: #6a6a6a;
            margin: 0;
        }

        #status {
            margin-top: 16px;
            font-size: 16px;
            color: #6a6a6a;
        }

        .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #1a1a1a;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Pocket</h1>
        <h2>Redefinir Senha</h2>

        <p id="message">
            Toque no botão abaixo para abrir o app Pocket e redefinir sua senha.
        </p>

        <a href="#" id="openApp" class="button">Abrir no App</a>

        <div class="info">
            <p><strong>O app não abriu?</strong></p>
            <p>Certifique-se de que o app Pocket está instalado no seu dispositivo.</p>
        </div>
    </div>

    <script>
        // Supabase envia os tokens no HASH da URL (depois do #), não nos query params
        const hash = window.location.hash.substring(1); // Remove o #
        const hashParams = new URLSearchParams(hash);

        // Extrair tokens do hash
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const type = hashParams.get('type');

        console.log('Hash completo:', window.location.hash);
        console.log('Access Token:', accessToken ? 'presente' : 'ausente');
        console.log('Refresh Token:', refreshToken ? 'presente' : 'ausente');
        console.log('Type:', type);

        // Detectar sistema operacional
        const userAgent = navigator.userAgent || navigator.vendor || window.opera;
        const isAndroid = /android/i.test(userAgent);
        const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;

        // Construir deep link apropriado para cada plataforma
        // Usar path simples sem parênteses (groups do Expo Router)
        const params = \`access_token=\${accessToken}&refresh_token=\${refreshToken}&type=\${type}\`;

        let deepLink;
        if (isAndroid) {
            // Intent URL para Android (funciona melhor que deep link simples)
            deepLink = \`intent://reset-password?tokens=\${encodeURIComponent(params)}#Intent;scheme=pocket;package=com.gladius.pocket;end\`;
        } else {
            // Deep link padrão para iOS
            deepLink = \`pocket://reset-password?tokens=\${encodeURIComponent(params)}\`;
        }

        console.log('Plataforma:', isAndroid ? 'Android' : isIOS ? 'iOS' : 'Desconhecida');
        console.log('Deep link:', deepLink);

        // Configurar o botão
        const openAppButton = document.getElementById('openApp');

        // Definir o href do botão com o deep link
        if (openAppButton) {
            openAppButton.href = deepLink;

            openAppButton.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('Botão clicado, tentando abrir app...');
                console.log('Deep link:', deepLink);

                // Tentar abrir o app
                window.location.href = deepLink;

                // Para iOS, dar um tempo e mostrar alerta se não abrir
                if (isIOS) {
                    setTimeout(function() {
                        const message = 'Se o app não abriu, certifique-se de que o Pocket está instalado.';
                        alert(message);
                    }, 2000);
                }
            });
        }
    </script>
</body>
</html>`;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // Extrair parâmetros da URL
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const type = url.searchParams.get('type');

  console.log('Redirect request received:', { token, type });

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
});

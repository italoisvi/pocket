import Constants from 'expo-constants';
import { File } from 'expo-file-system';

export type ReceiptData = {
  establishmentName: string;
  amount: number;
  date: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
};

export async function extractReceiptData(
  imageUri: string
): Promise<ReceiptData> {
  const apiKey = Constants.expoConfig?.extra?.openaiApiKey;

  if (!apiKey) {
    throw new Error('OpenAI API key não configurada');
  }

  const base64Image = await convertImageToBase64(imageUri);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are a receipt OCR system. Extract data from receipts and return ONLY valid JSON without any additional text or markdown. If you cannot read the receipt clearly, make your best effort to extract any visible information.',
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract the following information from this receipt in JSON format: establishmentName (string), amount (number), date (YYYY-MM-DD string), items (array of objects with name, quantity as number, and price as number). Return ONLY the JSON object, no markdown, no additional text.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('OpenAI API Error:', error);
    throw new Error(`Erro ao processar imagem: ${error}`);
  }

  const data = await response.json();
  console.log('OpenAI Response:', JSON.stringify(data, null, 2));

  const content = data.choices[0].message.content;
  console.log('Content from OpenAI:', content);

  // Try to extract JSON from markdown code blocks or plain text
  let jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (!jsonMatch) {
    jsonMatch = content.match(/\{[\s\S]*\}/);
  }

  if (!jsonMatch) {
    console.error('Could not find JSON in response:', content);
    throw new Error(
      'Não foi possível extrair dados do comprovante. Resposta: ' +
        content.substring(0, 100)
    );
  }

  const jsonString = jsonMatch[1] || jsonMatch[0];
  console.log('Extracted JSON string:', jsonString);

  let receiptData;
  try {
    receiptData = JSON.parse(jsonString);
  } catch (parseError) {
    console.error('JSON Parse Error:', parseError);
    throw new Error('Erro ao processar dados do comprovante');
  }

  return {
    establishmentName: receiptData.establishmentName || 'Estabelecimento',
    amount: Number(receiptData.amount) || 0,
    date: receiptData.date || new Date().toISOString().split('T')[0],
    items: Array.isArray(receiptData.items) ? receiptData.items : [],
  };
}

async function convertImageToBase64(uri: string): Promise<string> {
  try {
    const file = new File(uri);
    const arrayBuffer = await file.arrayBuffer();
    // Convert ArrayBuffer to base64
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    return base64;
  } catch (error) {
    console.error('Error converting image to base64:', error);
    throw new Error('Não foi possível processar a imagem');
  }
}

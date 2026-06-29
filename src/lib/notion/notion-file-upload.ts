const NOTION_API_VERSION = '2025-09-03';

function notionHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
    'Notion-Version': NOTION_API_VERSION,
  };
}

/** 上傳圖片到 Notion 永久儲存，回傳 file_upload id（須在 1 小時內 attach 到頁面）。 */
export async function uploadImageToNotion(
  buffer: Buffer,
  filename: string,
  contentType = 'image/png'
): Promise<string> {
  const createRes = await fetch('https://api.notion.com/v1/file_uploads', {
    method: 'POST',
    headers: {
      ...notionHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filename, content_type: contentType }),
  });

  if (!createRes.ok) {
    throw new Error(`Notion file_upload create failed: ${createRes.status} ${await createRes.text()}`);
  }

  const created = (await createRes.json()) as { id: string };
  const uploadId = created.id;

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)], { type: contentType }), filename);

  const sendRes = await fetch(`https://api.notion.com/v1/file_uploads/${uploadId}/send`, {
    method: 'POST',
    headers: notionHeaders(),
    body: form,
  });

  if (!sendRes.ok) {
    throw new Error(`Notion file_upload send failed: ${sendRes.status} ${await sendRes.text()}`);
  }

  const sent = (await sendRes.json()) as { status?: string };
  if (sent.status !== 'uploaded') {
    throw new Error(`Notion file_upload status: ${sent.status ?? 'unknown'}`);
  }

  return uploadId;
}

export function wFileUpload(fileUploadId: string, name: string) {
  return {
    files: [{
      type: 'file_upload',
      file_upload: { id: fileUploadId },
      name,
    }],
  };
}

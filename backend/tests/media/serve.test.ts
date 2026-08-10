import { describe, expect, it } from 'vitest';
import { contentTypeForKey } from '../../src/media/store.js';
import { app } from '../../src/app.js';

describe('media serve', () => {
  it('rejects unknown extensions as octet-stream but serves known types', () => {
    expect(contentTypeForKey('media/x/a.jpg')).toBe('image/jpeg');
    expect(contentTypeForKey('media/x/a.webm')).toBe('video/webm');
    expect(contentTypeForKey('media/x/a.html')).toBe('application/octet-stream');
  });

  it('GET /media/upload is not registered as a body-writer endpoint', async () => {
    const res = await app.request('http://localhost:8787/media/upload', { method: 'GET' });
    expect([400, 405, 404]).toContain(res.status);
  });
});

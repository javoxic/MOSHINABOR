import { renderTemplate } from './templates.service';
import { sniffImageType } from '../files/image-processor';

describe('renderTemplate', () => {
  it('substitutes known placeholders and keeps unknown ones', () => {
    expect(renderTemplate('{vehicle}: «{service}» {date}', { vehicle: 'Cobalt', service: 'Oil', date: '2026-01-01' })).toBe('Cobalt: «Oil» 2026-01-01');
    expect(renderTemplate('Hi {name}', {})).toBe('Hi {name}');
    expect(renderTemplate('{km} km', { km: 0 })).toBe('0 km');
  });
});

describe('sniffImageType', () => {
  it('detects formats by magic bytes', () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('jpeg');
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBe('png');
    expect(sniffImageType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]))).toBe('webp');
    expect(sniffImageType(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypheic')]))).toBe('heic');
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImageType(Buffer.from('GIF89a......'))).toBeNull();
  });
});

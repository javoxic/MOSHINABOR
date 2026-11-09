import { normalizePhone, maskPhone, isUzbekPhone } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['+998 90 123 45 67', '+998901234567'],
    ['998901234567', '+998901234567'],
    ['90 123-45-67', '+998901234567'],
    ['(93) 555 12 34', '+998935551234'],
    ['00998971234567', '+998971234567'],
    ['+7 916 123-45-67', '+79161234567'],
    ['+1 415 555 2671', '+14155552671'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizePhone(input)?.e164).toBe(expected);
  });

  it.each(['', '123', 'abc', '+998 12', '+99890123456789', '+998 71 123 45 67xx'])(
    'rejects %s',
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );

  it('rejects Uzbek fixed-line numbers that cannot receive SMS', () => {
    // 71 is the Tashkent landline area code
    expect(normalizePhone('+998 71 123 45 67')).toBeNull();
  });
});

describe('maskPhone', () => {
  it('masks the middle digits', () => {
    expect(maskPhone('+998901234567')).toBe('+99890*****67');
  });
});

describe('isUzbekPhone', () => {
  it('detects Uzbek numbers', () => {
    expect(isUzbekPhone('+998901234567')).toBe(true);
    expect(isUzbekPhone('+79161234567')).toBe(false);
  });
});

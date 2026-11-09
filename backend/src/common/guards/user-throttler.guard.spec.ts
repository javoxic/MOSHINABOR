import { subjectFromBearer } from './user-throttler.guard';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

describe('subjectFromBearer', () => {
  it('uses the token subject so users behind one NAT IP have separate budgets', () => {
    expect(subjectFromBearer(`Bearer ${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', typ: 'user' })}.sig`)).toBe('user:u1');
    expect(subjectFromBearer(`Bearer ${b64({ alg: 'HS256' })}.${b64({ sub: 'a1', typ: 'admin' })}.sig`)).toBe('admin:a1');
  });
  it('falls back to IP for missing or malformed tokens', () => {
    expect(subjectFromBearer(undefined)).toBeNull();
    expect(subjectFromBearer('Basic abc')).toBeNull();
    expect(subjectFromBearer('Bearer not.a.jwt')).toBeNull();
    expect(subjectFromBearer(`Bearer x.${b64({ sub: 'x'.repeat(200) })}.y`)).toBeNull();
  });
});

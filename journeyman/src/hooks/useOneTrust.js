import { useEffect, useState } from 'react';

export default function useOneTrust() {
  const [consentGranted, setConsentGranted] = useState(false);

  useEffect(() => {
    const domainId = process.env.REACT_APP_ONETRUST_ID || 'YOUR_DOMAIN_ID';
    const script = document.createElement('script');
    script.src = `https://cdn.cookielaw.org/consent/${domainId}/otSDKStub.js`;
    script.setAttribute('data-domain-script', domainId);
    script.async = true;
    document.body.appendChild(script);

    const checkConsent = () => {
      const groups = window.OptanonActiveGroups || '';
      setConsentGranted(groups.includes('C0002'));
    };

    window.OptanonWrapper = checkConsent;
    script.onload = checkConsent;

    return () => {
      delete window.OptanonWrapper;
    };
  }, []);

  const Overlay = () =>
    consentGranted ? null : (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.8)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
          textAlign: 'center',
          padding: '1rem',
        }}
      >
        Please accept analytics cookies to play.
      </div>
    );

  return { consentGranted, Overlay };
}

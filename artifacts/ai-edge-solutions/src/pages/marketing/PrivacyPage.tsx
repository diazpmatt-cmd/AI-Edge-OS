import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";

const SECTION_STYLE: React.CSSProperties = { marginBottom: 36 };
const H2_STYLE: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#E5E7EB", marginBottom: 10, marginTop: 0 };
const P_STYLE: React.CSSProperties = { fontSize: 15, lineHeight: 1.75, color: "#9CA3AF", margin: "0 0 10px" };
const UL_STYLE: React.CSSProperties = { paddingLeft: 20, margin: "0 0 10px", color: "#9CA3AF", fontSize: 15, lineHeight: 1.8 };

export default function PrivacyPage() {
  return (
    <div style={{ background: "#030612", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Nav />
      <main style={{ flex: 1, maxWidth: 800, margin: "0 auto", padding: "80px 24px 60px", width: "100%" }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, color: "#E5E7EB", marginBottom: 8, marginTop: 0 }}>Privacy Policy</h1>
        <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 48, marginTop: 0 }}>
          Last updated: June 20, 2025
        </p>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>1. Introduction</h2>
          <p style={P_STYLE}>
            AI Edge Solutions ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains
            how we collect, use, disclose, and safeguard your information when you visit our website
            (<a href="https://ai-edge-solutions.replit.app" style={{ color: "#00AEEF" }}>https://ai-edge-solutions.replit.app</a>)
            or use our services, including any social media integrations and automation tools.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>2. Information We Collect</h2>
          <p style={P_STYLE}>We may collect the following types of information:</p>
          <ul style={UL_STYLE}>
            <li><strong style={{ color: "#D1D5DB" }}>Account Information:</strong> Name, email address, business name, and contact details you provide when registering or contacting us.</li>
            <li><strong style={{ color: "#D1D5DB" }}>Social Media Data:</strong> When you connect social media accounts (YouTube, TikTok, Facebook, Instagram), we store OAuth access tokens and basic profile data (account name, account ID) to enable our automation services.</li>
            <li><strong style={{ color: "#D1D5DB" }}>Usage Data:</strong> Pages visited, time spent, browser type, IP address, and referring URLs collected automatically through standard web analytics.</li>
            <li><strong style={{ color: "#D1D5DB" }}>Communications:</strong> Messages and inquiries you send us via our contact form.</li>
          </ul>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>3. How We Use Your Information</h2>
          <p style={P_STYLE}>We use collected information to:</p>
          <ul style={UL_STYLE}>
            <li>Provide, operate, and maintain our services</li>
            <li>Connect and manage your social media accounts on your behalf</li>
            <li>Automate content publishing, scheduling, and distribution as authorized by you</li>
            <li>Respond to inquiries and provide customer support</li>
            <li>Improve our website and services</li>
            <li>Send service-related communications (not marketing without your consent)</li>
            <li>Comply with applicable laws and regulations</li>
          </ul>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>4. Social Media Integrations</h2>
          <p style={P_STYLE}>
            Our platform integrates with third-party social media platforms including TikTok, YouTube, Facebook, and Instagram.
            When you connect these accounts, we request only the permissions necessary to perform the services you authorize.
            We do not sell, rent, or share your social media data with third parties for their own marketing purposes.
          </p>
          <p style={P_STYLE}>
            OAuth tokens are stored securely and used solely to execute actions you have explicitly authorized. You may revoke
            access at any time through your social media platform's account settings or through our platform's connections page.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>5. Data Sharing and Disclosure</h2>
          <p style={P_STYLE}>We do not sell your personal information. We may share information only:</p>
          <ul style={UL_STYLE}>
            <li>With service providers who assist us in operating our platform (under strict confidentiality agreements)</li>
            <li>When required by law, court order, or governmental authority</li>
            <li>To protect the rights, property, or safety of AI Edge Solutions, our users, or others</li>
            <li>With your explicit consent</li>
          </ul>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>6. Data Retention</h2>
          <p style={P_STYLE}>
            We retain your information for as long as your account is active or as needed to provide services. You may request
            deletion of your data at any time by contacting us at the address below. Social media tokens are deleted when you
            disconnect an account.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>7. Security</h2>
          <p style={P_STYLE}>
            We implement industry-standard security measures including encrypted storage of credentials, HTTPS-only
            communication, and access controls. No method of transmission over the Internet is 100% secure, and we cannot
            guarantee absolute security.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>8. Your Rights</h2>
          <p style={P_STYLE}>Depending on your location, you may have the right to:</p>
          <ul style={UL_STYLE}>
            <li>Access the personal information we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Opt out of certain data processing activities</li>
            <li>Data portability</li>
          </ul>
          <p style={P_STYLE}>To exercise these rights, contact us at the address in Section 10.</p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>9. Cookies</h2>
          <p style={P_STYLE}>
            We use cookies and similar tracking technologies to maintain sessions, remember preferences, and analyze site
            traffic. You may disable cookies through your browser settings, though some features may not function properly.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>10. Contact Us</h2>
          <p style={P_STYLE}>
            For privacy-related questions or requests, please contact us at:
          </p>
          <p style={{ fontSize: 15, color: "#9CA3AF", lineHeight: 1.75, margin: 0 }}>
            <strong style={{ color: "#D1D5DB" }}>AI Edge Solutions</strong><br />
            Email: <a href="mailto:privacy@ai-edge-solutions.com" style={{ color: "#00AEEF" }}>privacy@ai-edge-solutions.com</a><br />
            Website: <a href="https://ai-edge-solutions.replit.app/contact" style={{ color: "#00AEEF" }}>ai-edge-solutions.replit.app/contact</a>
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>11. Changes to This Policy</h2>
          <p style={{ ...P_STYLE, margin: 0 }}>
            We may update this Privacy Policy from time to time. We will notify you of significant changes by updating the
            "Last updated" date at the top of this page. Continued use of our services after changes constitutes acceptance
            of the updated policy.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}

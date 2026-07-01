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
          Last updated: June 30, 2026
        </p>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>1. Introduction</h2>
          <p style={P_STYLE}>
            AI Edge Solutions ("we," "our," or "us") operates this platform and provides AI-powered marketing automation
            services to local service businesses. This Privacy Policy explains how we collect,
            use, disclose, and safeguard your information when you visit our website or use our services, including any
            social media integrations, automation tools, and SMS text messaging programs.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>2. Information We Collect</h2>
          <p style={P_STYLE}>We may collect the following types of information:</p>
          <ul style={UL_STYLE}>
            <li><strong style={{ color: "#D1D5DB" }}>Account Information:</strong> Name, email address, business name, and contact details you provide when registering or contacting us.</li>
            <li><strong style={{ color: "#D1D5DB" }}>Phone Numbers:</strong> Mobile phone numbers provided via contact forms, inbound calls, or inbound SMS messages, used solely to deliver the services described in this policy.</li>
            <li><strong style={{ color: "#D1D5DB" }}>Social Media Data:</strong> When you connect social media accounts (YouTube, TikTok, Facebook, Instagram), we store OAuth access tokens and basic profile data (account name, account ID) to enable our automation services.</li>
            <li><strong style={{ color: "#D1D5DB" }}>Usage Data:</strong> Pages visited, time spent, browser type, IP address, and referring URLs collected automatically through standard web analytics.</li>
            <li><strong style={{ color: "#D1D5DB" }}>Communications:</strong> Messages and inquiries you send us via our contact form or SMS.</li>
          </ul>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>3. How We Use Your Information</h2>
          <p style={P_STYLE}>We use collected information to:</p>
          <ul style={UL_STYLE}>
            <li>Provide, operate, and maintain our services</li>
            <li>Connect and manage your social media accounts on your behalf</li>
            <li>Automate content publishing, scheduling, and distribution as authorized by you</li>
            <li>Send appointment reminders, quote confirmations, service updates, missed-call follow-ups, and customer-care messages via SMS</li>
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

        {/* ── SMS COMPLIANCE SECTION — required for 10DLC / Telnyx ── */}
        <div style={{
          ...SECTION_STYLE,
          background: "rgba(0,174,239,0.05)",
          border: "1px solid rgba(0,174,239,0.2)",
          borderRadius: 12,
          padding: "24px 28px",
        }}>
          <h2 style={{ ...H2_STYLE, color: "#00AEEF" }}>5. SMS Messaging &amp; Text Communications</h2>
          <p style={P_STYLE}>
            By providing your mobile phone number and submitting a contact or quote request form, or by texting or calling
            our business number, you consent to receive text messages from <strong style={{ color: "#D1D5DB" }}>AI Edge Solutions</strong>{" "}
            and our client businesses at the number you provided. These messages may include:
          </p>
          <ul style={UL_STYLE}>
            <li>Appointment reminders and confirmations</li>
            <li>Quote and estimate notifications</li>
            <li>Service updates and follow-ups</li>
            <li>Missed-call follow-up messages</li>
            <li>Customer care and support communications</li>
          </ul>

          <p style={{ ...P_STYLE, marginTop: 16 }}>
            <strong style={{ color: "#D1D5DB" }}>Consent is not a condition of purchase.</strong> You are not required to
            consent to receive text messages to purchase any product or service.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            {[
              "SMS opt-in data and consent will not be shared with any third party for marketing purposes.",
              "Message frequency varies depending on your interactions and service status.",
              "Message and data rates may apply.",
              'Reply STOP at any time to opt out. You will receive one final confirmation message, then no further texts will be sent.',
              'Reply HELP for assistance. You may also contact us directly at the information in Section 11 below.',
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#00AEEF", flexShrink: 0, marginTop: 8 }} />
                <p style={{ ...P_STYLE, margin: 0 }}>{item}</p>
              </div>
            ))}
          </div>

          <p style={{ ...P_STYLE, marginTop: 16, marginBottom: 0 }}>
            To opt out of all text communications at any time, reply <strong style={{ color: "#D1D5DB" }}>STOP</strong> to
            any message. For support, reply <strong style={{ color: "#D1D5DB" }}>HELP</strong> or contact us at the address
            in Section 11.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>6. Data Sharing and Disclosure</h2>
          <p style={P_STYLE}>We do not sell your personal information. We do not share SMS opt-in data or consent with third parties for marketing purposes. We may share information only:</p>
          <ul style={UL_STYLE}>
            <li>With service providers who assist us in operating our platform (under strict confidentiality agreements)</li>
            <li>With telecommunications carriers for the purpose of delivering SMS messages you have consented to receive</li>
            <li>When required by law, court order, or governmental authority</li>
            <li>To protect the rights, property, or safety of AI Edge Solutions, our users, or others</li>
            <li>With your explicit consent</li>
          </ul>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>7. Data Retention</h2>
          <p style={P_STYLE}>
            We retain your information for as long as your account is active or as needed to provide services. You may request
            deletion of your data at any time by contacting us at the address below. Social media tokens are deleted when you
            disconnect an account. If you opt out of SMS messages via STOP, your number is added to our internal suppression
            list and will not receive further texts.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>8. Security</h2>
          <p style={P_STYLE}>
            We implement industry-standard security measures including encrypted storage of credentials, HTTPS-only
            communication, and access controls. No method of transmission over the Internet is 100% secure, and we cannot
            guarantee absolute security.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>9. Your Rights</h2>
          <p style={P_STYLE}>Depending on your location, you may have the right to:</p>
          <ul style={UL_STYLE}>
            <li>Access the personal information we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Opt out of SMS communications at any time by replying STOP</li>
            <li>Opt out of certain data processing activities</li>
            <li>Data portability</li>
          </ul>
          <p style={P_STYLE}>To exercise these rights, contact us at the address in Section 11.</p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>10. Cookies</h2>
          <p style={P_STYLE}>
            We use cookies and similar tracking technologies to maintain sessions, remember preferences, and analyze site
            traffic. You may disable cookies through your browser settings, though some features may not function properly.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>11. Contact Us</h2>
          <p style={P_STYLE}>
            For privacy-related questions, requests, or to opt out of SMS communications, please contact us at:
          </p>
          <p style={{ fontSize: 15, color: "#9CA3AF", lineHeight: 1.75, margin: 0 }}>
            <strong style={{ color: "#D1D5DB" }}>AI Edge Solutions</strong><br />
            Email: <a href="mailto:privacy@ai-edge-solutions.com" style={{ color: "#00AEEF" }}>privacy@ai-edge-solutions.com</a><br />
            Website: <a href="https://aiedgesolutions.online/contact" style={{ color: "#00AEEF" }}>aiedgesolutions.online/contact</a>
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>12. Changes to This Policy</h2>
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

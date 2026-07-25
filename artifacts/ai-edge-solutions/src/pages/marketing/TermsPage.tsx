import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";

const SECTION_STYLE: React.CSSProperties = { marginBottom: 36 };
const H2_STYLE: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#E5E7EB", marginBottom: 10, marginTop: 0 };
const P_STYLE: React.CSSProperties = { fontSize: 15, lineHeight: 1.75, color: "#9CA3AF", margin: "0 0 10px" };
const UL_STYLE: React.CSSProperties = { paddingLeft: 20, margin: "0 0 10px", color: "#9CA3AF", fontSize: 15, lineHeight: 1.8 };

export default function TermsPage() {
  return (
    <div style={{ background: "#030612", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Nav />
      <main style={{ flex: 1, maxWidth: 800, margin: "0 auto", padding: "80px 24px 60px", width: "100%" }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, color: "#E5E7EB", marginBottom: 8, marginTop: 0 }}>Terms of Service</h1>
        <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 48, marginTop: 0 }}>
          Last updated: June 30, 2026
        </p>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>1. Acceptance of Terms</h2>
          <p style={P_STYLE}>
            By accessing or using the AI Edge Solutions website (<a href="https://aiedgesolutions.online" style={{ color: "#00AEEF" }}>https://aiedgesolutions.online</a>)
            or any of our services, you agree to be bound by these Terms of Service. If you do not agree to these terms,
            please do not use our services.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>2. Description of Services</h2>
          <p style={P_STYLE}>
            AI Edge Solutions provides AI-powered marketing automation services for local businesses, including:
          </p>
          <ul style={UL_STYLE}>
            <li>Social media content distribution and scheduling</li>
            <li>Lead recovery and AI receptionist services</li>
            <li>Business Edge Profile automation</li>
            <li>Review generation and reputation management</li>
            <li>Local SEO and AI visibility optimization</li>
            <li>Website design and maintenance</li>
          </ul>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>3. Account Registration</h2>
          <p style={P_STYLE}>
            To access certain features, you must create an account. You agree to provide accurate, current, and complete
            information and to keep your account credentials confidential. You are responsible for all activity that occurs
            under your account.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>4. Social Media Account Authorization</h2>
          <p style={P_STYLE}>
            When you connect third-party social media accounts (such as TikTok, YouTube, Facebook, or Instagram), you
            authorize AI Edge Solutions to access and use those accounts solely to perform the services you request.
            You represent that you have the authority to grant this access.
          </p>
          <p style={P_STYLE}>
            You may revoke this authorization at any time through your social media platform settings or our platform.
            We are not responsible for any third-party platform's terms, policies, or actions regarding your accounts.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>5. Acceptable Use</h2>
          <p style={P_STYLE}>You agree not to use our services to:</p>
          <ul style={UL_STYLE}>
            <li>Violate any applicable laws or regulations</li>
            <li>Post illegal, harmful, or deceptive content</li>
            <li>Infringe on intellectual property rights of others</li>
            <li>Spam, harass, or abuse third-party platforms</li>
            <li>Violate the terms of service of any connected social media platform</li>
            <li>Attempt to gain unauthorized access to our systems or other accounts</li>
          </ul>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>6. Content Ownership</h2>
          <p style={P_STYLE}>
            You retain ownership of all content you provide or create using our services. By using our platform,
            you grant AI Edge Solutions a limited license to process and distribute your content as directed by you.
            We do not claim ownership over your content.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>7. Payment and Billing</h2>
          <p style={P_STYLE}>
            Fees for services are described on our pricing page. All fees are billed in advance and are non-refundable
            unless otherwise stated. We reserve the right to change pricing with 30 days' notice. Failure to pay may result
            in suspension or termination of services.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>8. Disclaimers</h2>
          <p style={P_STYLE}>
            Our services are provided "as is" without warranties of any kind, express or implied. We do not guarantee
            specific results from our AI automation or marketing services. Social media platform algorithm changes,
            policy updates, or account restrictions are outside our control and do not constitute a breach of these terms.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>9. Limitation of Liability</h2>
          <p style={P_STYLE}>
            To the fullest extent permitted by law, AI Edge Solutions shall not be liable for any indirect, incidental,
            special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or
            indirectly, or any loss of data, arising from your use of our services.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>10. Termination</h2>
          <p style={P_STYLE}>
            Either party may terminate service at any time. We reserve the right to suspend or terminate accounts that
            violate these Terms or applicable law. Upon termination, your right to use the services ceases immediately
            and we will delete your data in accordance with our Privacy Policy.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>11. Governing Law</h2>
          <p style={P_STYLE}>
            These Terms are governed by and construed in accordance with the laws of the United States. Any disputes
            arising under these Terms shall be resolved through binding arbitration or in courts of competent jurisdiction.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>12. Changes to Terms</h2>
          <p style={P_STYLE}>
            We reserve the right to modify these Terms at any time. We will notify you of material changes by updating
            the "Last updated" date. Your continued use of our services after changes constitutes acceptance of the
            updated Terms.
          </p>
        </div>

        <div style={{
          ...SECTION_STYLE,
          background: "rgba(0,174,239,0.05)",
          border: "1px solid rgba(0,174,239,0.2)",
          borderRadius: 12,
          padding: "24px 28px",
        }}>
          <h2 style={{ ...H2_STYLE, color: "#00AEEF" }}>13. SMS Text Messaging</h2>
          <p style={P_STYLE}>
            By providing your phone number and submitting a form on our website, or by calling or texting our
            business number, you consent to receive SMS text messages from <strong style={{ color: "#D1D5DB" }}>Bed Bugs &amp; Beyond</strong>{" "}
            (powered by AI Edge Solutions) for the purpose of appointment confirmations, quote notifications,
            service updates, missed-call follow-ups, and customer-care communications.
          </p>
          <ul style={UL_STYLE}>
            <li><strong style={{ color: "#D1D5DB" }}>No third-party marketing sharing:</strong> SMS opt-in data and consent will not be shared with any third party for marketing purposes.</li>
            <li><strong style={{ color: "#D1D5DB" }}>Message frequency:</strong> Varies based on your service interactions.</li>
            <li><strong style={{ color: "#D1D5DB" }}>Rates:</strong> Message and data rates may apply.</li>
            <li><strong style={{ color: "#D1D5DB" }}>Opt out:</strong> Reply STOP to any message to unsubscribe. You will receive one final confirmation, then no further messages.</li>
            <li><strong style={{ color: "#D1D5DB" }}>Help:</strong> Reply HELP for assistance or contact us at the address below.</li>
            <li>Consent is not a condition of purchase of any goods or services.</li>
          </ul>
          <p style={{ ...P_STYLE, margin: 0 }}>
            For full details on how we handle your data, see our{" "}
            <a href="/privacy-policy" style={{ color: "#00AEEF" }}>Privacy Policy</a>.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>14. Contact</h2>
          <p style={{ ...P_STYLE, margin: 0 }}>
            Questions about these Terms? Contact us at:
          </p>
          <p style={{ fontSize: 15, color: "#9CA3AF", lineHeight: 1.75, margin: "10px 0 0" }}>
            <strong style={{ color: "#D1D5DB" }}>AI Edge Solutions</strong><br />
            Email: <a href="mailto:legal@ai-edge-solutions.com" style={{ color: "#00AEEF" }}>legal@ai-edge-solutions.com</a><br />
            Website: <a href="https://aiedgesolutions.online/contact" style={{ color: "#00AEEF" }}>aiedgesolutions.online/contact</a>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}

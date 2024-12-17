"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { trackEvent } from "../hooks/analytics";

/* eslint-disable react/no-unescaped-entities */
export const PrivacyPolicy = () => {
  const [tracked, setTracked] = useState(false);

  useEffect(() => {
    if (!tracked) {
      trackEvent("page_viewed", { page: "Privacy Policy" });
      setTracked(true);
    }
  }, [tracked]);

  return (
    <div className="mt-10 space-y-4 text-justify text-sm font-normal leading-6 dark:text-[#FFFFFF80]">
      <h3 className="text-base font-medium">1. Introduction</h3>
      <p>
        Welcome to Paycrest, Inc. (“The Company”"we," "our," or "us"), the
        company behind noblocks.xyz and Paycrest Protocol ("the Services"). We
        are committed to protecting the privacy and personal information of our
        users ("you," "your," or "user"). This Privacy Policy outlines how we
        collect, use, share, and protect your personal data when you use our
        Service, which allows for cryptocurrency payments that are converted and
        received in local currency.{" "}
        <b>
          By using our Service, you agree to the practices described in this
          Privacy Policy. If you do not agree to any of our practices in this
          Privacy Policy, please do not use the Service.
        </b>
      </p>

      <h3 className="text-base font-medium">2. Information We Collect</h3>
      <p>2.1. Information We Do Not Collect Directly</p>
      <p>
        We do not directly collect or store personal information from our users.
        Our service allows you to connect your cryptocurrency wallet to our app
        without the need for you to provide personal details to us.
      </p>
      <p>2.2. Information Collected During Wallet Connection</p>
      <p>
        When you connect your crypto wallet to our app, the following
        information may be automatically shared with us:
      </p>
      <p className="pl-3">
        a. Public Wallet Address: We receive your public wallet address, which
        is necessary for facilitating transactions and interactions within the
        app.
        <br />
        b. Transaction Data: Information related to transactions made through
        the app, such as transaction amounts, recipient addresses, and
        associated metadata, may be captured.
        <br />
        c. Device and Usage Information: We may collect non-personal data such
        as IP addresses, device type, browser version, and interaction logs to
        enhance the security and performance of our service.
      </p>
      <p>2.3. Information Collected Through KYC Verification</p>
      <p>
        To comply with regulatory requirements, users are required to complete
        Know Your Customer (KYC) verification through our third-party provider.
        We do not collect or store personal information submitted during the KYC
        process. However, after verification, we retain the following:
      </p>
      <p className="pl-3">
        a. KYC Reference Code: A unique reference code provided by our
        third-party provider, which confirms that KYC has been successfully
        completed.
        <br />
        b. Wallet Address: The public wallet address associated with the private
        key that signed the KYC verification.
      </p>
      <p>2.4 Non-Personal Information</p>
      <p>
        We may also collect non-personal information, which includes aggregated
        or anonymized data that does not directly identify you. This data may
        encompass general usage patterns, trends, and statistical insights into
        how our service is utilized. We use this information to analyze
        performance, enhance the functionality of our service, and develop new
        features, ensuring a better user experience for all.
      </p>
      <p>2.5 Transaction Information</p>
      <p className="pl-3">
        a. In the course of providing our Services, the Company retains certain
        information related to the recipient of a transaction. Specifically, we
        store the recipient's account details (e.g., bank account or other
        relevant payment information) and a receipt of the transaction. This
        information is retained to ensure compliance with legal and regulatory
        obligations, facilitate transaction tracking, and maintain service
        transparency.
      </p>
      <p className="pl-3">
        b. Please note that the retention of these details is limited to what is
        necessary for the functioning of our Services and adherence to
        applicable laws. The Company does not use or share this information for
        any other purpose without the user's explicit consent, except where
        required by law.
      </p>
      <h3 className="text-base font-medium">3. How We Use Your Information</h3>
      <p>
        We utilize the information we collect for a variety of essential
        purposes, including:
      </p>
      <p className="pl-3">
        a. Service Delivery: We use the information we collect to manage and
        coordinate transactions between you and the recipient. This involves
        receiving your submitted transaction, working with our third-party
        providers to ensure that the transfer is handled properly, and
        confirming that the recipient receives the intended value in their
        preferred form. Our goal is to provide you with a seamless and efficient
        experience throughout the transaction process.
        <br />
        b. Legal Compliance: To fulfill our legal and regulatory obligations,
        including adhering to Know Your Customer (KYC) and Anti-Money Laundering
        (AML) laws, ensuring that our operations remain lawful and transparent.
        <br />
        c. Service Enhancement: To analyze usage patterns and user interactions,
        allowing us to continuously improve our service, optimize performance,
        and introduce new features that meet your evolving needs.
        <br />
        d. Security and Protection: To safeguard our users and our company by
        detecting, investigating, and preventing fraud, unauthorized activities,
        and other potential security threats, maintaining the integrity and
        security of our platform.
      </p>
      <h3 className="text-base font-medium">
        4. How We Share Your Information
      </h3>
      <p>
        We may share your information in the following circumstances to ensure
        the smooth operation of our service and to comply with legal and
        regulatory requirements:
      </p>
      <p>
        a. With Third-Party Service Providers: We partner with trusted
        third-party service providers to perform essential functions on our
        behalf. These functions include processing payments,exchanging digital
        assets into the recipient's preferred form of value, conducting Know
        Your Customer (KYC) checks, and providing other services required to
        operate our platform.
        <br />
        b. For Legal and Compliance Reasons: We may disclose your information
        when required to comply with applicable laws, regulations, or legal
        processes. This includes responding to subpoenas, court orders, or
        government requests. Additionally, we may share your information if we
        believe it is necessary to:
        <br />
        I. Protect our legal rights, property, and safety, as well as the
        rights, property, and safety of our users or the public;
        <br />
        II. Enforce our terms of service, agreements, and policies;
        <br />
        III. Investigate, prevent, or take action regarding suspected illegal
        activities, fraud, or security threats.
        <br />
        c. With Your Consent: In situations where your explicit consent is
        required, we will ask for your permission before sharing your
        information with third parties for purposes not covered by this Privacy
        Policy.
        <br />
        d. In Business Transfers: If we are involved in a merger, acquisition,
        or sale of all or a portion of our assets, your information may be
        transferred as part of that transaction. We will notify you of any such
        transfer and ensure that the new entity continues to protect your
        information in accordance with this Privacy Policy.
      </p>
      <h3 className="text-base font-medium">5. Security of Your Information</h3>
      <p>
        We are committed to ensuring the security of your interactions with our
        Service. While we employ industry-standard encryption and secure servers
        to safeguard any information processed through our Service, no system
        can guarantee absolute security.
      </p>
      <p>Your Responsibilities:</p>
      <p className="pl-3">
        a. Wallet Security: You are responsible for securing your cryptocurrency
        wallet and any associated credentials. Ensure that your wallet
        information is kept confidential and use strong security practices to
        protect it.
        <br />
        b. Device Security: Protect your personal devices and any access points
        to your cryptocurrency wallet from unauthorized use. This includes
        keeping your software and systems up-to-date and using secure, unique
        passwords.
        <br />
        c. By using our Service, you acknowledge that while we strive to
        implement robust security measures, you are ultimately responsible for
        your wallet’s security and for any transactions made through it.
      </p>
      <h3 className="text-base font-medium">6. Your Rights</h3>
      <p>
        6.1 Although we do not collect or retain personal data directly, you
        have the following rights concerning any information processed through
        our Service:
      </p>
      <p className="pl-3">
        a. Access: You may request information about any personal data collected
        or processed by our third-party providers in relation to your use of the
        Service. We will assist in facilitating such requests with the relevant
        third parties.
        <br />
        b. Correction: If you believe that any personal information held by our
        third-party providers is inaccurate or incomplete, you can request that
        it be corrected or updated. We will guide you on how to make this
        request directly with the third parties involved.
        <br />
        c. Deletion: You have the right to request the deletion of your personal
        information. Since we do not store personal data directly, any request
        for deletion will be directed to the relevant third-party service
        managing your data. We will assist in this process as needed.
        <br />
        d. Restriction: You may request that the processing of your personal
        data be restricted under certain conditions. This request should be
        directed to the third-party service handling your data, and we will help
        facilitate this request where possible.
        <br />
        e. Data Portability: If applicable, you have the right to obtain a copy
        of your personal data in a structured, commonly used, and
        machine-readable format. You can also request to transfer this data to
        another organization. This request should be made to the third-party
        service responsible for managing your data, and we will support you in
        initiating this process.
      </p>
      <p>
        6.2 Please note that our role is to facilitate communication with the
        third-party services responsible for handling personal data. For
        specific details on how to exercise these rights, please refer to the
        privacy policies and contact procedures of the relevant third-party
        providers.
      </p>
      <p>
        6.3 To exercise any of these rights or for any questions related to your
        personal information, please contact us at{" "}
        <Link
          className="font-bold text-blue-500"
          href="https://legal@paycrest.io"
        >
          legal@paycrest.io
        </Link>
      </p>
      <h3 className="text-base font-medium">
        7. International Data Transfers:
      </h3>
      <p>
        7.1 As a global service, we may facilitate transactions and processes
        involving data that could be transferred to countries outside of your
        jurisdiction, including the United States, where our company is based.
        However, as we do not collect or directly manage personal data, any data
        transfers are handled by our third-party providers.
      </p>
      <p>
        7.2 When your data is transferred internationally by these third-party
        providers, they are required to implement appropriate measures to ensure
        that your information is protected in accordance with applicable data
        protection laws and in alignment with this Privacy Policy. We work with
        these providers to ensure that they adhere to stringent security
        standards and data protection requirements.
      </p>
      <p>
        7.3 If you have any concerns about how your data is handled or
        transferred, please refer to the privacy policies of the third-party
        services we use, as they will detail their practices and safeguards
        regarding international data transfers.
      </p>

      <h3 className="text-base font-medium">
        8. Retention of Your Information
      </h3>
      <p>
        Since we do not directly collect personal information from our users,
        the data we retain is limited to the reference codes, wallet addresses
        associated with transactions and KYC verification, recipient bank
        details and proof of transaction. This information is kept only for as
        long as necessary to fulfill the operational purposes outlined in this
        Privacy Policy, including compliance with legal obligations and the
        resolution of disputes. Once the data is no longer required for these
        purposes, we will securely delete or anonymize it, in line with
        applicable laws and industry standards.
      </p>
      <h3 className="text-base font-medium">
        9. Third-Party Applications and Services
      </h3>
      <p>
        9.1 Our service may involve the use of third-party applications or
        services that may request personal information from you and use cookies
        or similar technologies. While these third-party providers are
        independent entities with their own privacy practices, we partner only
        with entities that comply with relevant data protection laws. However,
        we do not control the data collection practices of these third parties
        and are not responsible for their privacy policies or practices. We
        encourage you to review their privacy policies to understand how your
        information is handled.
      </p>

      <p>9.2 Information Collection by Third Parties</p>
      <p>
        When you interact with third-party applications through our service,
        they may request personal information such as your name, email address,
        or payment details. This information is collected and processed by the
        third party, not by us. We recommend reviewing the privacy policies of
        any third-party services you use to understand how your information will
        be handled.
      </p>
      <p>9.3. Cookies and Tracking Technologies</p>
      <p>
        Third-party applications may use cookies, web beacons, or other tracking
        technologies to collect information about your online activity. These
        technologies help third parties analyze usage patterns, deliver
        personalized content, and improve their services. You have the option to
        manage your cookie preferences through your browser settings or the
        third-party’s privacy settings.
      </p>
      <p>9.4 Data Sharing with Third Parties</p>
      <p>
        We may share limited data, such as wallet addresses or transaction
        details, with third-party providers to facilitate the services offered
        through our platform. However, any personal information collected by
        these third parties is governed by their privacy policies, not ours.
      </p>
      <p>9.5 Your Responsibility</p>
      <p>
        It is your responsibility to review and understand the privacy practices
        of any third-party applications or services you engage with through our
        platform. We encourage you to contact the third parties directly if you
        have any concerns about how your information is being handled.
      </p>
      <h3 className="text-base font-medium">10. Children's Privacy</h3>
      <p>
        10.1 Our services are not intended for use by individuals under the age
        of 18. We do not knowingly collect personal information from children.
        If you are under 18, please do not use our services or submit any
        personal information through our platform.
      </p>
      <p>
        10.2 While we do not collect personal data directly, third-party
        services integrated with our platform, such as KYC verification
        providers, may collect information. These third parties have their own
        privacy policies, and we encourage parents and guardians to review those
        policies to understand how their child’s data might be handled.
      </p>
      <p>
        10.3 If we become aware that we have inadvertently received personal
        information from a child without parental consent, we will take steps to
        delete such information from our records. If you believe that a child
        under 18 has provided us with personal information, please contact us at{" "}
        <Link
          href="https://legal@paycrest.io"
          className="font-bold text-blue-500"
        >
          legal@paycrest.io
        </Link>
      </p>
      <h3 className="text-base font-medium">
        11. Automated Decision-Making and Profiling
      </h3>
      <p>
        11.1 We do not engage in automated decision-making processes or
        profiling that produce legal effects or significantly affect you as an
        individual. Our service is designed to facilitate cryptocurrency
        transactions with human oversight, ensuring that while automation aids
        in processing, key decisions and any complex issues are reviewed and
        monitored by our team to provide a fair and secure experience.
      </p>
      <p>
        11.2 Any decisions regarding the use of your information or the outcome
        of transactions are subject to human review and are not solely based on
        automated processing. If third-party services integrated with our
        platform perform any automated decision-making, they do so under their
        own privacy policies, and we recommend reviewing those policies for
        further information.
      </p>
      <h3 className="text-base font-medium">
        12. Changes to This Privacy Policy
      </h3>
      <p>
        We may update this Privacy Policy from time to time to reflect changes
        in our practices, technology, legal requirements, or other factors. We
        will notify you of any significant changes by posting the updated policy
        on our website and indicating the effective date. Please review this
        Privacy Notice regularly to ensure that you are aware of its terms. Your
        continued use of our service after the effective date constitutes your
        acceptance of the updated policy.
      </p>
      <h3 className="text-base font-medium">13. Contact Us</h3>
      <p>
        If you have any questions or concerns about this Privacy Policy or our
        data practices, please contact us at{" "}
        <Link
          href="https://legal@paycrest.io"
          className="font-bold text-blue-500"
        >
          legal@paycrest.io
        </Link>
      </p>
    </div>
  );
};

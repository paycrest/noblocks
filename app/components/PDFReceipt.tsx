import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
} from "@react-pdf/renderer";
import { format } from "date-fns";
import { formatCurrency, getInstitutionNameByCode } from "../utils";
import type { OrderDetailsData, InstitutionProps } from "../types";

Font.register({
  family: "Inter",
  fonts: [
    {
      src: "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.8/files/inter-latin-300-normal.woff",
      fontWeight: 300,
    },
    {
      src: "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.8/files/inter-latin-400-normal.woff",
      fontWeight: 400,
    },
    {
      src: "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.8/files/inter-latin-500-normal.woff",
      fontWeight: 500,
    },
    {
      src: "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.8/files/inter-latin-700-normal.woff",
      fontWeight: 700,
    },
  ],
});

const styles = StyleSheet.create({
  page: {
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
    fontFamily: "Inter",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    padding: 16,
  },
  headerText: {
    flexDirection: "column",
  },
  title: {
    fontSize: 16,
    fontWeight: 500,
    marginBottom: 8,
  },
  date: {
    fontSize: 12,
    color: "#6C6C89",
  },
  logo: {
    width: 40,
    height: 40,
  },
  content: {
    padding: 16,
  },
  amount: {
    fontSize: 18,
    fontWeight: 600,
    marginBottom: 8,
    marginTop: 20,
    color: "#121217",
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 40,
  },
  statusIcon: {
    width: 12,
    height: 12,
    marginRight: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 600,
    color: "#15803D",
  },
  infoItem: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    color: "#8E8E8F",
    marginBottom: 4,
  },
  value: {
    fontSize: 14,
    fontWeight: 400,
    color: "#121217",
  },
  divider: {
    borderBottomWidth: 4,
    borderBottomColor: "#F9FAFB",
    marginVertical: 20,
  },
  qrSection: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 48,
    marginBottom: 24,
  },
  qrCode: {
    width: 150,
    height: 150,
    marginRight: 28,
  },
  qrText: {
    fontSize: 20,
    fontWeight: 700,
    color: "#121217",
  },
  noblocks: {
    color: "#8B85F4",
  },
  footer: {
    backgroundColor: "#F9FAFB",
    padding: 10,
  },
  footerText: {
    fontSize: 14,
    color: "#8E8E8F",
    textAlign: "right",
  },
});

export const PDFReceipt = ({
  data,
  formData,
  supportedInstitutions,
}: {
  data: OrderDetailsData;
  formData: {
    recipientName: string;
    accountIdentifier: string;
    institution: string;
    memo: string;
    amountReceived: number;
    currency: string;
  };
  supportedInstitutions?: InstitutionProps[];
}) => {
  const {
    recipientName,
    accountIdentifier,
    institution,
    memo,
    amountReceived,
    currency,
  } = formData;

  const institutionName = supportedInstitutions
    ? getInstitutionNameByCode(institution, supportedInstitutions)
    : institution;

  const formatDate = (dateString: string | number | Date) => {
    const date = new Date(dateString);
    return format(date, "dd MMM, yyyy HH:mm, 'UTC' xxx");
  };

  const infoItems = [
    { label: "To", value: recipientName || "N/A" },
    { label: "Account number", value: accountIdentifier || "N/A" },
    { label: "Bank", value: institutionName || "N/A" },
    { label: "Description", value: memo || "N/A" },
    { label: "Transaction ID", value: data?.orderId || "N/A" },
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={[styles.header, { borderTop: "4 solid #8B85F4" }]}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Receipt</Text>
            <Text style={styles.date}>
              {formatDate(data?.updatedAt || new Date())}
            </Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src="/logos/noblocks-logo-icon.png" style={styles.logo} />
        </View>

        <View style={styles.content}>
          <Text style={styles.amount}>
            {amountReceived.toLocaleString()} {currency}
          </Text>
          <View style={styles.statusContainer}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image
              src="/icons/tick-01-stroke-rounded.png"
              style={styles.statusIcon}
            />
            <Text style={styles.statusText}>Success</Text>
          </View>

          {infoItems.map((item, index) => (
            <View key={index} style={styles.infoItem}>
              <Text style={styles.label}>{item.label}</Text>
              <Text style={styles.value}>{item.value}</Text>
            </View>
          ))}

          <View style={styles.divider} />

          <View style={styles.qrSection}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src="/images/noblocks-qr-code.png" style={styles.qrCode} />
            <View>
              <Text style={styles.qrText}>Make more transactions</Text>
              <Text style={styles.qrText}>
                on <Text style={styles.noblocks}>noblocks</Text>
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>noblocks.xyz</Text>
        </View>
      </Page>
    </Document>
  );
};

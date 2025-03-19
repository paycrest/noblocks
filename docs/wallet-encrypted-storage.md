# Wallet-Encrypted IPFS Storage: Technical Explanation

## From Simple to Secure: The Evolution of Our Storage Implementation

### 1. Core Concepts

#### What is IPFS?

**IPFS (InterPlanetary File System)** is a distributed system for storing and accessing files, websites, applications, and data. Unlike traditional storage where files are located by their location (URL), IPFS identifies content by what's in it using a **Content Identifier (CID)**.

#### What is Helia?

**Helia** is a modern JavaScript implementation of IPFS. It's lightweight and designed to work well in web browsers. We use Helia to interact with the IPFS network.

#### What is DAG?

**DAG (Directed Acyclic Graph)** is a data structure used by IPFS. Think of it as a specialized way to store structured data (like JSON) that maintains relationships between pieces of data.

### 2. The Evolution of Our Storage Implementation

#### Stage 1: Simple String Storage

In our initial implementation, we used Helia's string interface to store and retrieve plain text:

```javascript
// Save a string to IPFS
const cid = await stringsInstance.add("Hello, IPFS")

// Retrieve the string from IPFS
const data = await stringsInstance.get(cid)
```

This worked well for simple text but had limitations:

- No encryption (anyone with the CID could read the data)
- No way to associate data with a specific user
- No structure to the data

#### Stage 2: Structured Data with DAG

We evolved to use Helia's DAG interface, which allows storing structured data (objects, arrays):

```javascript
// Store structured data
const cid = await dagInstance.add({ transactions: [...] })

// Retrieve structured data
const data = await dagInstance.get(cid)
```

This allowed us to store complex data structures but still lacked security.

#### Stage 3: Wallet-Encrypted Storage (Current Implementation)

Our current implementation adds several security layers:

1. **Wallet-derived encryption keys**: Using your wallet to sign messages and derive encryption keys
2. **End-to-end encryption**: Data is encrypted before storage and decrypted after retrieval
3. **User-specific storage**: Data is tied to your specific wallet address
4. **Content-addressing**: Data is still identified by its content (after encryption)

### 3. How Our Current System Works

#### Saving Data - Step by Step

1. **Message Signing**:
   - You sign a message with your wallet (the same message each time)
   - This signature is unique to your wallet and can't be reproduced by others

2. **Key Derivation**:
   - We transform your signature into an encryption key using PBKDF2
   - This key is deterministic (the same signature always produces the same key)

3. **Encryption**:
   - Your data is encrypted using AES-GCM, a strong encryption algorithm
   - We use a random Initialization Vector (IV) for additional security

4. **IPFS Storage**:
   - The encrypted data is stored on IPFS
   - IPFS returns a Content Identifier (CID)

5. **CID Storage**:
   - The CID is stored in your browser's localStorage
   - The CID is associated with your wallet address for retrieval

#### Retrieving Data - Step by Step

1. **Message Signing**:
   - You sign the same message with your wallet
   - This produces the same signature as before

2. **Key Derivation**:
   - The same encryption key is derived from your signature

3. **CID Retrieval**:
   - We look up the CID associated with your wallet address

4. **Data Retrieval**:
   - The encrypted data is fetched from IPFS using the CID

5. **Decryption**:
   - Your data is decrypted using your wallet-derived key
   - Only your wallet can generate the correct key to decrypt the data

### 4. Technical Terms Explained

- **AES-GCM**: Advanced Encryption Standard with Galois/Counter Mode, a secure encryption algorithm
- **PBKDF2**: Password-Based Key Derivation Function 2, a way to derive keys from passwords (or in our case, signatures)
- **Content Identifier (CID)**: A unique hash that identifies content in IPFS
- **Initialization Vector (IV)**: A random value used to ensure the same data encrypts differently each time
- **Wallet Signature**: A cryptographic proof that you control a specific wallet address

### 5. Security Considerations

- **Wallet Security**: The security of your data depends on the security of your wallet
- **CID Exposure**: The CID itself doesn't reveal the data, but it can reveal that data exists
- **localStorage Limitations**: localStorage is browser-specific and can be cleared
- **IPFS Permanence**: Data stored on IPFS may remain accessible even if you lose the CID

### 6. Benefits of This Approach

- **Privacy**: Only you can decrypt your data
- **No server dependency**: Storage works in a decentralized way via IPFS
- **Interoperability**: Data can be accessed from any device with your wallet
- **Content integrity**: IPFS ensures data isn't tampered with

### 7. How This Compares to Cloud Storage

- **Control**: You control your keys, not a third party
- **Decentralization**: No single point of failure
- **Privacy**: The service provider cannot read your data
- **Persistence**: Data exists as long as someone on IPFS network has it

By combining wallet signatures, encryption, and IPFS, we've created a secure, private storage system that requires no accounts or passwords beyond your existing wallet.

import dns from 'node:dns';
import mongoose from 'mongoose';

export async function connectDb() {
  // mongodb+srv:// URIs need SRV/TXT DNS lookups, which use the adapters' DNS
  // list — a VPN adapter pointing DNS at a dead local proxy breaks them.
  // Set DNS_SERVERS (comma-separated, e.g. 8.8.8.8,1.1.1.1) to override.
  if (process.env.DNS_SERVERS) {
    dns.setServers(process.env.DNS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean));
  }

  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/purosoul-cash';
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log(`[db] connected to ${uri.replace(/\/\/[^@]+@/, '//***@')}`);
}

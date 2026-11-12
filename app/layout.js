import './globals.css';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'TSE.Engine | موتور تحلیل هوشمند بورس تهران',
  description: 'تحلیل داده‌محور بازار سرمایه ایران با موتور یادگیری ماشین — ۶۰۶ سهم، ۹۹ فیچر تکنیکال و بنیادی',
  keywords: ['بورس', 'تحلیل', 'بورس تهران', 'TSETMC', 'تحلیل تکنیکال'],
};

export default function RootLayout({ children }) {
  return (
    <html lang="fa" dir="rtl">
      <body className="min-h-screen antialiased">
        <div className="mesh-bg" />
        <Navbar />
        <main className="pt-16">{children}</main>
        <Footer />
      </body>
    </html>
  );
}

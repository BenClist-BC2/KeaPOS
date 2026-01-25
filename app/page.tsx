import { redirect } from 'next/navigation';

export default function RootPage() {
  // Redirect to admin dashboard by default
  // Later we can make this a proper landing page or login page
  redirect('/dashboard');
}

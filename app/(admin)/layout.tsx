import Link from "next/link";

const navigation = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Menu Items", href: "/dashboard/menu" },
  { name: "Locations", href: "/dashboard/locations" },
  { name: "Staff", href: "/dashboard/staff" },
  { name: "Reports", href: "/dashboard/reports" },
  { name: "Settings", href: "/dashboard/settings" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 min-h-screen bg-white border-r border-gray-200">
          <div className="p-6">
            <h1 className="text-xl font-bold text-gray-900">KeaPOS</h1>
            <p className="text-sm text-gray-500">Admin Portal</p>
          </div>
          <nav className="px-4">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className="block px-4 py-2 mb-1 text-gray-700 rounded-lg hover:bg-gray-100"
              >
                {item.name}
              </Link>
            ))}
          </nav>
          <div className="absolute bottom-0 w-64 p-4 border-t border-gray-200">
            <Link
              href="/terminal"
              className="block px-4 py-2 text-center text-white bg-black rounded-lg hover:bg-gray-800"
            >
              Open POS Terminal
            </Link>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}

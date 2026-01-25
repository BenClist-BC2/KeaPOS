export default function DashboardPage() {
  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Welcome to KeaPOS admin portal</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard title="Today's Sales" value="$0.00" subtitle="0 transactions" />
        <StatCard title="Active Locations" value="0" subtitle="0 terminals online" />
        <StatCard title="Menu Items" value="0" subtitle="0 categories" />
        <StatCard title="Staff Members" value="0" subtitle="0 online now" />
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Getting Started</h2>
        <div className="space-y-3">
          <ChecklistItem done={false} text="Set up your first location" />
          <ChecklistItem done={false} text="Add menu items" />
          <ChecklistItem done={false} text="Invite staff members" />
          <ChecklistItem done={false} text="Configure payment settings" />
          <ChecklistItem done={false} text="Connect receipt printer" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <p className="text-sm text-gray-600">{title}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
    </div>
  );
}

function ChecklistItem({ done, text }: { done: boolean; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
          done ? "bg-green-500 border-green-500" : "border-gray-300"
        }`}
      >
        {done && (
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
      <span className={done ? "text-gray-400 line-through" : "text-gray-700"}>{text}</span>
    </div>
  );
}

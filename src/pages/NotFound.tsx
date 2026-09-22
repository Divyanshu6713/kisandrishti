import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/ui/primitives';

export default function NotFound() {
  return (
    <div className="container-page py-24">
      <EmptyState
        icon={<Compass className="h-5 w-5" />}
        title="This page isn’t on the map"
        body="The link may be old or mistyped."
        action={
          <Link to="/app" className="btn-primary">
            Go to overview
          </Link>
        }
      />
    </div>
  );
}

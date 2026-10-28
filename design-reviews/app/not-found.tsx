import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty">
      Screen not found.
      <Link className="btn" href="/">
        Back to reviews
      </Link>
    </div>
  );
}

type TabViewerProps = {
  tabText?: string;
  songTitle?: string;
  segments?: string[][];
};

export default function TabViewer({ tabText, songTitle, segments }: TabViewerProps) {
  void tabText;
  void songTitle;
  void segments;
  return (
    <div className="stack" aria-live="polite" aria-busy="true">
      <p>Loading tab preview...</p>
    </div>
  );
}

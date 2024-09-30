import Rive from "@rive-app/react-canvas";

export const HeroAnimation = () => {
  return (
    <div className="w-full h-full max-h-[1110px]">
      {/* dark theme */}
      <div className="w-full h-full hidden dark:block">
        <Rive src="/rive/flashed-dots_dark.riv" />
      </div>

      {/* light theme */}
      <iframe
        title="Hero Animation"
        className="w-full h-full block dark:hidden"
        src="https://rive.app/s/ZFjBkptlY0__QMMRaNHCJA/embed"
        allow="autoplay"
      />
    </div>
  );
};

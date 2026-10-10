using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;

// Presentation-only Windows entry point; Python owns preparation and lifecycle.
internal static class Launcher
{
    private static int Main(string[] args)
    {
        Console.Title = "Cake Tagger";
        Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs e) { e.Cancel = true; };
        try
        {
            if (args.Length > 1 || (args.Length == 1 && args[0] != "--review"))
                throw new ArgumentException("Supported option: --review");
            string root = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            string script = Path.Combine(root, "scripts", "start.py");
            if (!File.Exists(script)) throw new FileNotFoundException("Keep Cake-Tagger.exe inside the complete Cake Tagger folder.");
            string python = Path.Combine(root, "runtime", "python.exe");
            if (!File.Exists(python)) python = Path.Combine(root, "runtime", "cpython", "python.exe");
            bool prepared = File.Exists(python) && File.Exists(Path.Combine(Path.GetDirectoryName(python), "python313._pth"))
                && File.Exists(Path.Combine(Path.GetDirectoryName(python), "python313.dll"))
                && File.Exists(Path.Combine(Path.GetDirectoryName(python), "python313.zip"));
            var start = new ProcessStartInfo();
            start.WorkingDirectory = root;
            start.UseShellExecute = false;
            start.FileName = prepared ? python : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "cmd.exe");
            start.Arguments = prepared ? "-u scripts/start.py" : "/d /c scripts\\launch.cmd start";
            if (args.Length == 1) start.Arguments += " --review";
            using (Process process = Process.Start(start))
            {
                process.WaitForExit();
                if (process.ExitCode != 0) PauseAfterFailure();
                return process.ExitCode;
            }
        }
        catch (Exception error)
        {
            Console.Error.WriteLine("Cake Tagger could not start: " + error.Message);
            PauseAfterFailure();
            return 1;
        }
    }

    private static void PauseAfterFailure()
    {
        if (Console.IsInputRedirected) return;
        try { Console.WriteLine("Press any key to close."); Console.ReadKey(true); }
        catch (InvalidOperationException) { }
    }
}

using Serilog.Core;
using Serilog.Events;

namespace MediaHouse.Config;

public class LoggingLevelSwitchConfig
{
    public LoggingLevelSwitch LevelSwitch { get; } = new LoggingLevelSwitch(LogEventLevel.Information);
}

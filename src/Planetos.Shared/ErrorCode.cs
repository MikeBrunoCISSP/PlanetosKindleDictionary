namespace Planetos.Shared;
public static class ErrorCode {
    public const Int32 E_SUCCESS          = 0;
    public const Int32 E_NULLPARAMETER    = unchecked((Int32)0x80004003);
    public const Int32 E_AGENT_VERSION    = unchecked((Int32)0x8001011A);
    public const Int32 E_EMPTY            = unchecked((Int32)0x80094004);
    public const Int32 E_FILENOTFOUND     = unchecked((Int32)0x80070002);
    public const Int32 E_ACCESSDENIED     = unchecked((Int32)0x80070005);
    public const Int32 E_NOT_SUPPORTED    = unchecked((Int32)0x80070032);
    public const Int32 E_INVALIDARG       = unchecked((Int32)0x80070057);
    public const Int32 E_NOTFOUND         = unchecked((Int32)0x80070490);
    public const Int32 E_BADFORMAT        = unchecked((Int32)0x8007000b);
    public const Int32 E_LOGONFAILURE     = unchecked((Int32)0x8007052E);
    public const Int32 E_DUPLICATE        = unchecked((Int32)0x80071392);
    public const Int32 E_CURRENTDIRECTORY = unchecked((Int32)0x80070010);
    public const Int32 E_INVALIDSTATE     = unchecked((Int32)0x80131509);
    public const Int32 E_UNEXPECTED       = unchecked((Int32)0x8000FFFF);
}

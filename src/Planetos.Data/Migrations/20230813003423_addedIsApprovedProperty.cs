using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Planetos.Data.Migrations
{
    /// <inheritdoc />
    public partial class addedIsApprovedProperty : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsApproved",
                table: "WordDefinitions",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsApproved",
                table: "WordDefinitions");
        }
    }
}

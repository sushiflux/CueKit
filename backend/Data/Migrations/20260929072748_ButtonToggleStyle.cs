using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Deck.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class ButtonToggleStyle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ToggleStyle",
                table: "Buttons",
                type: "TEXT",
                nullable: false,
                defaultValue: "led");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ToggleStyle",
                table: "Buttons");
        }
    }
}
